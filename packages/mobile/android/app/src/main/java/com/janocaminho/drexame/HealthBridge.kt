package com.janocaminho.drexame

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.atomic.AtomicInteger

/**
 * HealthBridge — leitura AGREGADA de Passos / Calorias / Distância via Android Health Connect.
 *
 * Padrão da casa (idêntico ao DxBiometrics): injetado no WebView como `window.DxHealth`;
 * métodos síncronos só para checagens baratas, tudo que é async devolve via CustomEvent
 * `dx:health` com payload JSON { type, requestId, ... } — o lado web transforma em Promise.
 *
 * Contrato (ver packages/web/src/services/healthConnect.ts):
 *   isAvailable()                          -> Boolean (Health Connect instalado e suportado)
 *   checkPermissions(requestId)            -> event {type:"permissions", granted}
 *   aggregates(requestId, daysBack)        -> event {type:"aggregates", days:[{date,steps,kcal,km}]}
 *   (requestPermissions é lançado pela MainActivity via ActivityResultLauncher registrado lá —
 *    registerForActivityResult precisa acontecer antes de onStart, no ciclo da Activity.)
 */
class HealthBridge(private val activity: MainActivity) {

    companion object {
        const val EVENT = "dx:health"

        /** Health Connect exige API 26+. O manifest libera a lib em minSdk 23 via
         *  overrideLibrary — a segurança vem daqui: NENHUM método toca classes HC
         *  antes deste guard (ART carrega classes por método → <26 nunca carrega HC). */
        fun hcSdkOk(): Boolean = android.os.Build.VERSION.SDK_INT >= 26

        /**
         * Permissões de LEITURA (strings — o contrato 1.1.0 é Set<String>):
         * androidx.health.connect.permission.read.{Steps,TotalCaloriesBurned,Distance}.
         */
        val READ_PERMISSIONS: Set<String> by lazy {
            if (!hcSdkOk()) emptySet() else setOf(
                HealthPermission.getReadPermission(StepsRecord::class),
                HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
                HealthPermission.getReadPermission(DistanceRecord::class),
            )
        }
    }

    private val ui = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val requestSeq = AtomicInteger(0)

    @Volatile private var pendingRequestId: String = ""
    private var launcher: ActivityResultLauncher<Set<String>>? = null // contrato 1.1.0: Set<String>

    /**
     * Registra o launcher do contrato oficial de permissões do Health Connect.
     * DEVE ser chamado no onCreate da Activity (registerForActivityResult exige
     * registro antes de onStart) — a MainActivity chama ensureLauncher() no boot.
     */
    fun ensureLauncher(): ActivityResultLauncher<Set<String>>? {
        if (!hcSdkOk()) return null // <API 26: registra nada (nunca toca classes HC)
        launcher ?: run {
            launcher = (activity as ComponentActivity).registerForActivityResult(
                PermissionController.createRequestPermissionResultContract()
            ) { granted ->
                val ok = granted != null && granted.containsAll(READ_PERMISSIONS)
                onPermissionsResult(pendingRequestId, ok)
                // Libera a flag do gate com folga (o resume dispara antes deste callback às vezes).
                activity.evalJs("try{setTimeout(()=>{window.__dxNativeIntent=false},2500)}catch(e){}")
            }
        }
        return launcher
    }

    @JavascriptInterface
    fun requestPermissions(requestId: String) {
        val id = requestId.ifEmpty { "perm-${requestSeq.incrementAndGet()}" }
        if (!hcSdkOk()) { dispatch(errorPayload(id, "unavailable")); return; }
        // BUGFIX 336 (usuário real): sheet de permissão PAUSA o app → BiometricGate travava no
        // retorno e o resultado parecia "não acontecer". Avisamos o gate ANTES de abrir a sheet
        // (flag consumível — só ignora UM resume) e reportamos POR QUE falhou (provider ausente
        // precisa de update via Play — antes virava 'false' silencioso).
        val status = try { HealthConnectClient.getSdkStatus(activity) } catch (e: Throwable) { HealthConnectClient.SDK_UNAVAILABLE }
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            dispatch(errorPayload(id, if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) "provider_update" else "unavailable"))
            return
        }
        pendingRequestId = id
        ui.post {
            try {
                activity.evalJs("try{window.__dxNativeIntent=true}catch(e){}")
                ensureLauncher()?.launch(READ_PERMISSIONS)
            } catch (e: Throwable) {
                activity.evalJs("try{window.__dxNativeIntent=false}catch(e){}")
                // Health Connect sem app provador instalado → contrato pode falhar ao lançar.
                dispatch(errorPayload(id, "unavailable"))
            }
        }
    }

    // hcAvailable: ÚNICO ponto que toca HealthConnectClient — chamado apenas após o guard
    // hcSdkOk() (em <API 26 o ART nunca carrega a classe: o widget nem existe pro web layer).
    private fun hcAvailable(): Boolean = try {
        HealthConnectClient.getSdkStatus(activity) == HealthConnectClient.SDK_AVAILABLE
    } catch (e: Throwable) {
        false // Health Connect ausente (aparelho sem o módulo) — widget mostra estado web/desktop.
    }

    private fun clientOrNull(): HealthConnectClient? =
        if (hcSdkOk() && hcAvailable()) HealthConnectClient.getOrCreate(activity) else null

    // ------------------------------------------------------------------ API (JS)

    @JavascriptInterface
    fun isAvailable(): Boolean = hcSdkOk() && hcAvailable()

    @JavascriptInterface
    fun hasAllPermissions(): Boolean = try {
        val client = clientOrNull() ?: return false
        // Checagem síncrona (bloqueante curto): chamado 1x no boot do widget, em thread do bridge.
        kotlinx.coroutines.runBlocking {
            client.permissionController.getGrantedPermissions().containsAll(READ_PERMISSIONS)
        }
    } catch (e: Throwable) {
        false
    }

    @JavascriptInterface
    fun aggregates(requestId: String, daysBack: Int) {
        val id = requestId.ifEmpty { "agg-${requestSeq.incrementAndGet()}" }
        val days = daysBack.coerceIn(1, 31)
        val client = clientOrNull()
        if (client == null) { dispatch(errorPayload(id, "unavailable")); return }
        scope.launch {
            try {
                val zone: ZoneId = ZoneId.systemDefault()
                val arr = JSONArray()
                // Dia corrente primeiro (ordem DESC — o contrato do web espera mais recente primeiro).
                for (offset in 0 until days) {
                    val day: LocalDate = LocalDate.now(zone).minusDays(offset.toLong())
                    val start: Instant = day.atStartOfDay(zone).toInstant()
                    val end: Instant = day.plusDays(1).atStartOfDay(zone).toInstant()
                    val res = client.aggregate(
                        AggregateRequest(
                            metrics = setOf(
                                StepsRecord.COUNT_TOTAL,
                                TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                                DistanceRecord.DISTANCE_TOTAL,
                            ),
                            timeRangeFilter = TimeRangeFilter.between(start, end),
                        )
                    )
                    // get<T> explícito: a inferência com `res[...]` não resolve o out-projected
                    // AggregateMetric<Energy>/AggregateMetric<Length> (Kotlin 2.0).
                    val steps = res.get<Long>(StepsRecord.COUNT_TOTAL) ?: 0L
                    val kcal = res.get<Energy>(TotalCaloriesBurnedRecord.ENERGY_TOTAL)?.inKilocalories ?: 0.0
                    val km = res.get<Length>(DistanceRecord.DISTANCE_TOTAL)?.inKilometers ?: 0.0
                    arr.put(
                        JSONObject()
                            .put("date", day.toString()) // ISO yyyy-MM-dd (local do aparelho)
                            .put("steps", steps.toDouble())
                            .put("kcal", Math.round(kcal).toDouble())
                            .put("km", Math.round(km * 100.0) / 100.0)
                    )
                }
                dispatch(JSONObject().put("type", "aggregates").put("requestId", id).put("days", arr))
            } catch (e: SecurityException) {
                dispatch(errorPayload(id, "permission"))
            } catch (e: Throwable) {
                dispatch(errorPayload(id, e.message ?: "unknown"))
            }
        }
    }

    // ------------------------------------------------------------------ eventos

    /** Resultado do launcher de permissão (chamado pela MainActivity). */
    fun onPermissionsResult(requestId: String, granted: Boolean) =
        dispatch(
            JSONObject().put("type", "permissions").put("requestId", requestId).put("granted", granted)
        )

    private fun errorPayload(requestId: String, code: String): JSONObject =
        JSONObject().put("type", "error").put("requestId", requestId).put("code", code)

    private fun dispatch(payload: JSONObject) {
        val script = "window.dispatchEvent(new CustomEvent('$EVENT',{detail:${payload}}));"
        ui.post {
            (activity as? MainActivity)?.evalJs(script)
        }
    }
}
