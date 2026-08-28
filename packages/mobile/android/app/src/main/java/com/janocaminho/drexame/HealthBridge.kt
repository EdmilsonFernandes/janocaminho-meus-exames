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
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.time.TimeRangeFilter
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
         * CORE: o mínimo para o widget funcionar (passos + calorias + distância).
         * EXTENDED: dados extras (FR, exercício) — se o usuário não conceder, o widget
         * funciona normalmente sem eles (não bloqueia a conexão).
         */
        val CORE_PERMISSIONS: Set<String> by lazy {
            if (!hcSdkOk()) emptySet() else setOf(
                HealthPermission.getReadPermission(StepsRecord::class),
                HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
                HealthPermission.getReadPermission(DistanceRecord::class),
            )
        }
        val EXTENDED_PERMISSIONS: Set<String> by lazy {
            if (!hcSdkOk()) emptySet() else setOf(
                HealthPermission.getReadPermission(HeartRateRecord::class),
                HealthPermission.getReadPermission(ExerciseSessionRecord::class),
            )
        }
        /** Pedimos todas de uma vez, mas o gate de "conectado" só exige as CORE. */
        val READ_PERMISSIONS: Set<String> get() = CORE_PERMISSIONS + EXTENDED_PERMISSIONS
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
        val status = try { HealthConnectClient.getSdkStatus(activity) } catch (e: Throwable) { HealthConnectClient.SDK_UNAVAILABLE }
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            dispatch(errorPayload(id, if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) "provider_update" else "unavailable"))
            return
        }
        pendingRequestId = id
        ui.post {
            try {
                activity.evalJs("try{window.__dxNativeIntent=true}catch(e){}")
                val launched = ensureLauncher()?.launch(READ_PERMISSIONS)
                // FALLBACK (Samsung Android 16): o contrato resolve VAZIO em alguns aparelhos
                // (intent invisível mesmo com <queries>). Se não lançou nada em 1,5s, abre o
                // Health Connect DIRETO nas settings de permissão do nosso app.
                ui.postDelayed({
                    if (pendingRequestId == id) {
                        openHealthConnectSettings(id)
                    }
                }, 1500)
            } catch (e: Throwable) {
                activity.evalJs("try{window.__dxNativeIntent=false}catch(e){}")
                // Contrato falhou → tenta abrir o HC settings diretamente (garantido).
                openHealthConnectSettings(id)
            }
        }
    }

    /**
     * FALLBACK universal: abre o Health Connect (app ou sistema) nas permissões do NOSSO app.
     * Usado quando o ActivityResultContract falha silenciosamente (Samsung Android 16).
     * O usuário concede lá e volta pro app — ao voltar, o web re-checa hasAllPermissions().
     */
    private fun openHealthConnectSettings(requestId: String) {
        try {
            // Tenta 1: settings do HC com nosso package (abre direto na tela certa)
            val intent = android.content.Intent("androidx.health.ACTION_MANAGE_HEALTH_PERMISSIONS").apply {
                putExtra("android.intent.extra.PACKAGE_NAME", "com.janocaminho.drexame")
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (intent.resolveActivity(activity.packageManager) != null) {
                activity.startActivity(intent)
                dispatch(JSONObject().put("type", "permissions").put("requestId", requestId).put("granted", false).put("openedSettings", true))
                return
            }
            // Tenta 2: abre o app do Health Connect direto (o usuário acha nosso app na lista)
            val launchIntent = activity.packageManager.getLaunchIntentForPackage("com.google.android.healthconnect.controller")
                ?: activity.packageManager.getLaunchIntentForPackage("com.google.android.apps.healthdata")
            if (launchIntent != null) {
                activity.startActivity(launchIntent)
                dispatch(JSONObject().put("type", "permissions").put("requestId", requestId).put("granted", false).put("openedSettings", true))
                return
            }
            // Nada resolveu
            dispatch(errorPayload(requestId, "unavailable"))
        } catch (e: Throwable) {
            dispatch(errorPayload(requestId, "unavailable"))
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
    fun isAvailable(): Boolean {
        val sdkOk = hcSdkOk()
        val avail = hcAvailable()
        val result = sdkOk && avail
        android.util.Log.d("DxHealth", "isAvailable()=$result (sdkOk=$sdkOk hcAvail=$avail)")
        return result
    }

    @JavascriptInterface
    fun hasAllPermissions(): Boolean {
        return try {
            val client = clientOrNull()
            android.util.Log.d("DxHealth", "hasAllPermissions: client=${client != null}")
            if (client == null) return false
            val granted = kotlinx.coroutines.runBlocking {
                client.permissionController.getGrantedPermissions()
            }
            android.util.Log.d("DxHealth", "SDK granted (${granted.size}): ${granted.joinToString()}")
            android.util.Log.d("DxHealth", "Need core (${CORE_PERMISSIONS.size}): ${CORE_PERMISSIONS.joinToString()}")
            android.util.Log.d("DxHealth", "Need extended (${EXTENDED_PERMISSIONS.size}): ${EXTENDED_PERMISSIONS.joinToString()}")
            val hasCore = granted.containsAll(CORE_PERMISSIONS)
            android.util.Log.d("DxHealth", "hasAllPermissions result=$hasCore")
            hasCore
        } catch (e: Throwable) {
            android.util.Log.e("DxHealth", "hasAllPermissions FAILED: ${e.message}", e)
            false
        }
    }

    @JavascriptInterface
    fun aggregates(requestId: String, daysBack: Int) {
        android.util.Log.d("DxHealth", "aggregates(requestId=$requestId, days=$daysBack)")
        val id = requestId.ifEmpty { "agg-${requestSeq.incrementAndGet()}" }
        val days = daysBack.coerceIn(1, 31)
        val client = clientOrNull()
        android.util.Log.d("DxHealth", "aggregates: client=${client != null}")
        if (client == null) { dispatch(errorPayload(id, "unavailable")); return }
        scope.launch {
            try {
                val zone: ZoneId = ZoneId.systemDefault()
                val arr = JSONArray()
                val today: LocalDate = LocalDate.now(zone)
                val periodStart: Instant = today.minusDays((days - 1).toLong()).atStartOfDay(zone).toInstant()
                val periodEnd: Instant = today.plusDays(1).atStartOfDay(zone).toInstant()

                // DEDUP multi-fonte (Samsung Health + Google Fit + …): o aggregate global SOMA
                // registros de apps diferentes — quando dois apps registram o MESMO passeio
                // (sessões distintas, sem overlap pro HC deduplicar), os passos dobram.
                // Estratégia: ler os records UMA vez, somar POR ORIGEM em cada dia e ficar com
                // o MÁXIMO diário de cada métrica — o app que mais registrou aquele dia vence.
                // Bônus: origem sem calorias não zera a métrica de outra (max, não soma).
                // (SDK 1.1.0 não tem dataOriginsFilter no AggregateRequest — daí a soma manual.)
                data class OriginDay(val day: LocalDate, val origin: String)
                val stepsBy = HashMap<OriginDay, Long>()
                val kcalBy = HashMap<OriginDay, Double>()
                val kmBy = HashMap<OriginDay, Double>()
                val origins = LinkedHashSet<String>()
                try {
                    for (r in client.readRecords(
                        androidx.health.connect.client.request.ReadRecordsRequest(
                            recordType = StepsRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(periodStart, periodEnd),
                        )
                    ).records) {
                        val k = OriginDay(r.endTime.atZone(zone).toLocalDate(), r.metadata.dataOrigin.packageName)
                        origins.add(k.origin); stepsBy[k] = (stepsBy[k] ?: 0L) + r.count
                    }
                    for (r in client.readRecords(
                        androidx.health.connect.client.request.ReadRecordsRequest(
                            recordType = ActiveCaloriesBurnedRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(periodStart, periodEnd),
                        )
                    ).records) {
                        val k = OriginDay(r.endTime.atZone(zone).toLocalDate(), r.metadata.dataOrigin.packageName)
                        origins.add(k.origin); kcalBy[k] = (kcalBy[k] ?: 0.0) + r.energy.inKilocalories
                    }
                    for (r in client.readRecords(
                        androidx.health.connect.client.request.ReadRecordsRequest(
                            recordType = DistanceRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(periodStart, periodEnd),
                        )
                    ).records) {
                        val k = OriginDay(r.endTime.atZone(zone).toLocalDate(), r.metadata.dataOrigin.packageName)
                        origins.add(k.origin); kmBy[k] = (kmBy[k] ?: 0.0) + r.distance.inKilometers
                    }
                } catch (e: Exception) {
                    android.util.Log.w("DxHealth", "record read failed: ${e.message}")
                }
                android.util.Log.d("DxHealth", "dedup: ${origins.size} origem(ns) — ${origins.joinToString()}")

                // Dia corrente primeiro (ordem DESC — o contrato do web espera mais recente primeiro).
                for (offset in 0 until days) {
                    val day: LocalDate = today.minusDays(offset.toLong())
                    val start: Instant = day.atStartOfDay(zone).toInstant()
                    val end: Instant = day.plusDays(1).atStartOfDay(zone).toInstant()

                    var steps = 0L
                    var kcal = 0.0
                    var km = 0.0
                    for (o in origins) {
                        steps = Math.max(steps, stepsBy[OriginDay(day, o)] ?: 0L)
                        kcal = Math.max(kcal, kcalBy[OriginDay(day, o)] ?: 0.0)
                        km = Math.max(km, kmBy[OriginDay(day, o)] ?: 0.0)
                    }

                    // FR + exercício: lê RECORDS (não há métrica agregada p/ FR no SDK
                    // alpha11) e calcula avg/max manualmente — mais confiável cross-device.
                    var hrAvg = 0L; var hrMax = 0L; var exerciseMin = 0L
                    try {
                        android.util.Log.d("DxHealth", "Reading HR records for $day")
                        val hrResponse = client.readRecords(
                            androidx.health.connect.client.request.ReadRecordsRequest(
                                recordType = HeartRateRecord::class,
                                timeRangeFilter = TimeRangeFilter.between(start, end),
                            )
                        )
                        android.util.Log.d("DxHealth", "HR records: ${hrResponse.records.size}, samples: ${hrResponse.records.sumOf { it.samples.size }}")
                        val allSamples = hrResponse.records.flatMap { it.samples }
                        if (allSamples.isNotEmpty()) {
                            hrAvg = Math.round(allSamples.map { it.beatsPerMinute }.average())
                            hrMax = allSamples.maxOf { it.beatsPerMinute }
                            android.util.Log.d("DxHealth", "HR avg=$hrAvg max=$hrMax")
                        } else {
                            android.util.Log.w("DxHealth", "HR: no samples for $day")
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("DxHealth", "HR read FAILED: ${e.message}", e)
                    }
                    try {
                        val exResponse = client.readRecords(
                            androidx.health.connect.client.request.ReadRecordsRequest(
                                recordType = ExerciseSessionRecord::class,
                                timeRangeFilter = TimeRangeFilter.between(start, end),
                            )
                        )
                        exerciseMin = exResponse.records.sumOf { java.time.Duration.between(it.startTime, it.endTime).toMinutes() }
                        android.util.Log.d("DxHealth", "Exercise records: ${exResponse.records.size}, total min: $exerciseMin")
                    } catch (e: Exception) {
                        android.util.Log.e("DxHealth", "Exercise read FAILED: ${e.message}", e)
                    }

                    arr.put(
                        JSONObject()
                            .put("date", day.toString())
                            .put("steps", steps.toDouble())
                            .put("kcal", Math.round(kcal).toDouble())
                            .put("km", Math.round(km * 100.0) / 100.0)
                            .put("hrAvg", hrAvg.toDouble())
                            .put("hrMax", hrMax.toDouble())
                            .put("exerciseMin", exerciseMin.toDouble())
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
