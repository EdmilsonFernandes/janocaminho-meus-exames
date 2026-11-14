package com.janocaminho.drexame

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
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
 *   aggregates(requestId, daysBack, offsetDays) -> event {type:"aggregates", days:[{date,steps,kcal,kcalIsTotal,km,sleepMin,hrAvg,hrRest,hrMax,exerciseMin}]}
 *     offsetDays: desloca a janela p/ o PASSADO (backfill 90d = 3 chunks de 30 com offsets 60/30/0).
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
         * TOTAL de calorias está no CORE (não no EXTENDED) porque o Samsung Health NÃO
         * publica ActiveCaloriesBurned no Health Connect — só TotalCaloriesBurned (e
         * apenas de treinos): sem essa permissão, aparelho Samsung fica SEM caloria de
         * jeito nenhum.
         * EXTENDED: dados extras (FR, exercício, SONO) — concessão OPCIONAL: o popup
         * do HC vem com tudo ligado por padrão, mas desligar um toggle NÃO pode travar
         * a conexão (reporte do dono 18/10: concedeu e "não conectava" — o gate antigo
         * exigia TODAS). Sono nasceu no CORE (16/10) e VOLTOU pro EXTENDED: o custo do
         * re-prompt 1-tap superava o benefício e endurecia o gate.
         */
        val CORE_PERMISSIONS: Set<String> by lazy {
            if (!hcSdkOk()) emptySet() else setOf(
                HealthPermission.getReadPermission(StepsRecord::class),
                HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
                HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
                HealthPermission.getReadPermission(DistanceRecord::class),
            )
        }
        val EXTENDED_PERMISSIONS: Set<String> by lazy {
            if (!hcSdkOk()) emptySet() else setOf(
                HealthPermission.getReadPermission(HeartRateRecord::class),
                HealthPermission.getReadPermission(ExerciseSessionRecord::class),
                HealthPermission.getReadPermission(SleepSessionRecord::class),
            )
        }
        /**
         * COMPOSIÇÃO CORPORAL (relógio/balança — ex.: Galaxy Watch via Samsung Health):
         * conjunto SEPARADO, pedido só quando o usuário toca em "importar" na tela de
         * Composição corporal — não entra no popup do widget de atividade.
         * Gate = peso + % de gordura (sem os dois não existe avaliação); o resto é opcional.
         */
        val BODY_CORE_PERMISSIONS: Set<String> by lazy {
            if (!hcSdkOk()) emptySet() else setOf(
                HealthPermission.getReadPermission(WeightRecord::class),
                HealthPermission.getReadPermission(BodyFatRecord::class),
            )
        }
        val BODY_EXTRA_PERMISSIONS: Set<String> by lazy {
            if (!hcSdkOk()) emptySet() else setOf(
                HealthPermission.getReadPermission(BasalMetabolicRateRecord::class),
                HealthPermission.getReadPermission(HeightRecord::class),
            )
        }
        /** Pedimos todas de uma vez, mas o gate de "conectado" só exige as CORE. */
        val READ_PERMISSIONS: Set<String> get() = CORE_PERMISSIONS + EXTENDED_PERMISSIONS
    }

    private val ui = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val requestSeq = AtomicInteger(0)

    @Volatile private var pendingRequestId: String = ""
    /** true = o pedido de permissão em curso é o de composição corporal (gate diferente). */
    @Volatile private var pendingBody: Boolean = false
    private var launcher: ActivityResultLauncher<Set<String>>? = null // contrato 1.1.0: Set<String>

    /**
     * Registra o launcher do contrato oficial de permissões do Health Connect.
     * DEVE ser chamado no onCreate da Activity (registerForActivityResult exige
     * registro antes de onStart) — a MainActivity chama ensureLauncher() no boot.
     */
    fun ensureLauncher(): ActivityResultLauncher<Set<String>>? {
        if (!hcSdkOk()) return null // <API 26: registra nada (nunca toca classes HC)
        try {
            launcher ?: run {
                launcher = (activity as ComponentActivity).registerForActivityResult(
                    PermissionController.createRequestPermissionResultContract()
                ) { granted ->
                    // GATE = SÓ O CORE (reporte 18/10: exigir TODAS fazia "concedeu e não
                    // conectou" quando o usuário desligava qualquer toggle do EXTENDED —
                    // FR/exercício/sono são opcionais; o widget vive sem eles).
                    val ok = granted != null && granted.containsAll(if (pendingBody) BODY_CORE_PERMISSIONS else CORE_PERMISSIONS)
                    onPermissionsResult(pendingRequestId, ok)
                    // Libera a flag do gate com folga (o resume dispara antes deste callback às vezes).
                    activity.evalJs("try{setTimeout(()=>{window.__dxNativeIntent=false},2500)}catch(e){}")
                }
            }
        } catch (t: Throwable) {
            android.util.Log.e("DX_HEALTH", "ensureLauncher falhou de forma segura", t)
            return null
        }
        return launcher
    }

    @JavascriptInterface
    fun requestPermissions(requestId: String) = launchPermissions(requestId, body = false)

    /** Pede SÓ as permissões de composição corporal (peso, gordura, basal, altura). */
    @JavascriptInterface
    fun requestBodyPermissions(requestId: String) = launchPermissions(requestId, body = true)

    private fun launchPermissions(requestId: String, body: Boolean) {
        val id = requestId.ifEmpty { "perm-${requestSeq.incrementAndGet()}" }
        if (!hcSdkOk()) { dispatch(errorPayload(id, "unavailable")); return; }
        val status = try { HealthConnectClient.getSdkStatus(activity) } catch (e: Throwable) { HealthConnectClient.SDK_UNAVAILABLE }
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            dispatch(errorPayload(id, if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) "provider_update" else "unavailable"))
            return
        }
        pendingRequestId = id
        pendingBody = body
        ui.post {
            try {
                activity.evalJs("try{window.__dxNativeIntent=true}catch(e){}")
                val launched = ensureLauncher()?.launch(if (body) BODY_CORE_PERMISSIONS + BODY_EXTRA_PERMISSIONS else READ_PERMISSIONS)
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
    fun aggregates(requestId: String, daysBack: Int, offsetDays: Int) {
        android.util.Log.d("DxHealth", "aggregates(requestId=$requestId, days=$daysBack offset=$offsetDays)")
        val id = requestId.ifEmpty { "agg-${requestSeq.incrementAndGet()}" }
        val days = daysBack.coerceIn(1, 31)
        val offset = offsetDays.coerceIn(0, 730)
        val client = clientOrNull()
        android.util.Log.d("DxHealth", "aggregates: client=${client != null}")
        if (client == null) { dispatch(errorPayload(id, "unavailable")); return }
        scope.launch {
            try {
                val zone: ZoneId = ZoneId.systemDefault()
                val arr = JSONArray()
                val today: LocalDate = LocalDate.now(zone)
                // Janela [today-offset-(days-1) .. today-offset]: offset=0 = comportamento
                // legado (ontem..hoje). Backfill = offsets 60/30 → leituras em chunks.
                val periodStart: Instant = today.minusDays((offset + days - 1).toLong()).atStartOfDay(zone).toInstant()
                val periodEnd: Instant = today.minusDays(offset.toLong()).plusDays(1).atStartOfDay(zone).toInstant()

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
                val totalKcalBy = HashMap<OriginDay, Double>()
                val kmBy = HashMap<OriginDay, Double>()
                val sleepBy = HashMap<OriginDay, Long>()
                val origins = LinkedHashSet<String>()

                // PAGINAÇÃO OBRIGATÓRIA: o readRecords devolve no máx. 1000 registros por
                // página, MAIS ANTIGOS PRIMEIRO. O Samsung grava passos em segmentos curtos
                // (minuto a minuto) → 30 dias passam de 1000 → sem paginar, os dias RECENTES
                // caem fora (sintoma: 7 dias zerado, 30 dias com dado).
                suspend fun readAllSteps(): List<StepsRecord> {
                    val out = ArrayList<StepsRecord>(); var token: String? = null
                    do {
                        val resp = client.readRecords(
                            androidx.health.connect.client.request.ReadRecordsRequest(
                                recordType = StepsRecord::class,
                                timeRangeFilter = TimeRangeFilter.between(periodStart, periodEnd),
                                pageSize = 1000,
                                pageToken = token,
                            )
                        )
                        out += resp.records; token = resp.pageToken
                    } while (token != null)
                    return out
                }
                suspend fun readAllCalories(): List<ActiveCaloriesBurnedRecord> {
                    val out = ArrayList<ActiveCaloriesBurnedRecord>(); var token: String? = null
                    do {
                        val resp = client.readRecords(
                            androidx.health.connect.client.request.ReadRecordsRequest(
                                recordType = ActiveCaloriesBurnedRecord::class,
                                timeRangeFilter = TimeRangeFilter.between(periodStart, periodEnd),
                                pageSize = 1000,
                                pageToken = token,
                            )
                        )
                        out += resp.records; token = resp.pageToken
                    } while (token != null)
                    return out
                }
                // TOTAL (fallback Samsung): o Samsung Health só publica caloria TOTAL
                // (e só de treinos) — ler sempre; o merge por dia decide qual usar.
                suspend fun readAllTotalCalories(): List<TotalCaloriesBurnedRecord> {
                    val out = ArrayList<TotalCaloriesBurnedRecord>(); var token: String? = null
                    do {
                        val resp = client.readRecords(
                            androidx.health.connect.client.request.ReadRecordsRequest(
                                recordType = TotalCaloriesBurnedRecord::class,
                                timeRangeFilter = TimeRangeFilter.between(periodStart, periodEnd),
                                pageSize = 1000,
                                pageToken = token,
                            )
                        )
                        out += resp.records; token = resp.pageToken
                    } while (token != null)
                    return out
                }
                suspend fun readAllDistance(): List<DistanceRecord> {
                    val out = ArrayList<DistanceRecord>(); var token: String? = null
                    do {
                        val resp = client.readRecords(
                            androidx.health.connect.client.request.ReadRecordsRequest(
                                recordType = DistanceRecord::class,
                                timeRangeFilter = TimeRangeFilter.between(periodStart, periodEnd),
                                pageSize = 1000,
                                pageToken = token,
                            )
                        )
                        out += resp.records; token = resp.pageToken
                    } while (token != null)
                    return out
                }
                // SONO: sessões (com estágios). Volume baixo (1-3/linha), 1 página quase
                // sempre — paginação só por segurança. "Dormido" = soma dos estágios
                // ASLEEP* (AWAKE/OUT_OF_BED saem); sessão sem estágios conta a duração
                // inteira. Atribuição: data de ACORDAR (noite 23h→07h = dia do 07h —
                // semântica "ontem à noite" do Fitbit/Samsung).
                suspend fun readAllSleep(): List<SleepSessionRecord> {
                    val out = ArrayList<SleepSessionRecord>(); var token: String? = null
                    do {
                        val resp = client.readRecords(
                            androidx.health.connect.client.request.ReadRecordsRequest(
                                recordType = SleepSessionRecord::class,
                                timeRangeFilter = TimeRangeFilter.between(periodStart, periodEnd),
                                pageSize = 1000,
                                pageToken = token,
                            )
                        )
                        out += resp.records; token = resp.pageToken
                    } while (token != null)
                    return out
                }

                try {
                    for (r in readAllSteps()) {
                        val k = OriginDay(r.endTime.atZone(zone).toLocalDate(), r.metadata.dataOrigin.packageName)
                        origins.add(k.origin); stepsBy[k] = (stepsBy[k] ?: 0L) + r.count
                    }
                    for (r in readAllCalories()) {
                        val k = OriginDay(r.endTime.atZone(zone).toLocalDate(), r.metadata.dataOrigin.packageName)
                        origins.add(k.origin); kcalBy[k] = (kcalBy[k] ?: 0.0) + r.energy.inKilocalories
                    }
                    for (r in readAllTotalCalories()) {
                        val k = OriginDay(r.endTime.atZone(zone).toLocalDate(), r.metadata.dataOrigin.packageName)
                        origins.add(k.origin); totalKcalBy[k] = (totalKcalBy[k] ?: 0.0) + r.energy.inKilocalories
                    }
                    for (r in readAllDistance()) {
                        val k = OriginDay(r.endTime.atZone(zone).toLocalDate(), r.metadata.dataOrigin.packageName)
                        origins.add(k.origin); kmBy[k] = (kmBy[k] ?: 0.0) + r.distance.inKilometers
                    }
                    // Sono em try PRÓPRIO: permissão é EXTENDED (opcional desde 18/10) —
                    // sem ela o read lança SecurityException e NÃO pode derrubar a
                    // acumulação das métricas CORE que já rodaram acima.
                    try {
                        for (r in readAllSleep()) {
                            // SDK 1.1.0: stage é INT (@StageTypes). "Dormido" = SLEEPING/LIGHT/
                            // DEEP/REM (+UNKNOWN, ambíguo); acordado/fora da cama NÃO conta.
                            val awakeStages = setOf(
                                SleepSessionRecord.STAGE_TYPE_AWAKE,
                                SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
                                SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
                            )
                            val asleepMin = r.stages
                                .filter { it.stage !in awakeStages }
                                .sumOf { java.time.Duration.between(it.startTime, it.endTime).toMinutes() }
                                .let { if (it > 0) it else java.time.Duration.between(r.startTime, r.endTime).toMinutes() }
                            if (asleepMin <= 0) continue
                            val k = OriginDay(r.endTime.atZone(zone).toLocalDate(), r.metadata.dataOrigin.packageName)
                            origins.add(k.origin); sleepBy[k] = (sleepBy[k] ?: 0L) + asleepMin
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("DxHealth", "sleep read skipped: ${e.message}")
                    }
                } catch (e: Exception) {
                    android.util.Log.w("DxHealth", "record read failed: ${e.message}")
                }
                android.util.Log.d("DxHealth", "dedup: ${origins.size} origem(ns) — ${origins.joinToString()}")

                // Dia corrente primeiro (ordem DESC — o contrato do web espera mais recente primeiro).
                for (i in 0 until days) {
                    val day: LocalDate = today.minusDays((offset + i).toLong())
                    val start: Instant = day.atStartOfDay(zone).toInstant()
                    val end: Instant = day.plusDays(1).atStartOfDay(zone).toInstant()

                    var steps = 0L
                    var kcal = 0.0
                    var totalKcal = 0.0
                    var km = 0.0
                    var sleepMin = 0L
                    for (o in origins) {
                        steps = Math.max(steps, stepsBy[OriginDay(day, o)] ?: 0L)
                        kcal = Math.max(kcal, kcalBy[OriginDay(day, o)] ?: 0.0)
                        totalKcal = Math.max(totalKcal, totalKcalBy[OriginDay(day, o)] ?: 0.0)
                        km = Math.max(km, kmBy[OriginDay(day, o)] ?: 0.0)
                        sleepMin = Math.max(sleepMin, sleepBy[OriginDay(day, o)] ?: 0L)
                    }
                    // MERGE caloria por dia: ATIVA é a semântica certa do card ("Calorias");
                    // TOTAL (ativa + metabolismo basal, ~1.3-1.8k kcal/dia) é FALLBACK —
                    // dia sem NENHUM ativa em nenhuma origem usa o total (Samsung puro).
                    // Semânticas nunca se misturam no mesmo dia (max separado, flag honesta).
                    val kcalIsTotal = kcal <= 0.0 && totalKcal > 0.0
                    if (kcalIsTotal) kcal = totalKcal

                    // FR + exercício: lê RECORDS (não há métrica agregada p/ FR no SDK
                    // alpha11) e calcula avg/max/rest manualmente — mais confiável cross-device.
                    // hrRest = PERCENTIL 10 das amostras: o aparelho só grava FC durante
                    // atividade, então a média simples sai enviesada p/ cima (média de treino,
                    // não de repouso). O percentil baixo aproxima a FC de repouso do dia.
                    // QUOTA: no BACKFILL (offset>0) estas leituras por-dia PULAM — 30 dias ×
                    // 2 reads × 3 chunks = ~180 reads extras de uma vez estouravam a cota
                    // diária de leitura do Health Connect (padrão Life Dashboard: backfill
                    // enxuto; FR/exercício interessam só na janela viva).
                    var hrAvg = 0L; var hrMax = 0L; var hrRest = 0L; var exerciseMin = 0L
                    if (offset == 0) {
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
                                val sorted = allSamples.map { it.beatsPerMinute }.sorted()
                                hrAvg = Math.round(sorted.average())
                                hrMax = sorted.last()
                                hrRest = sorted[(sorted.size * 10 / 100).coerceAtMost(sorted.size - 1)]
                                android.util.Log.d("DxHealth", "HR avg=$hrAvg rest=$hrRest max=$hrMax")
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
                    }

                    arr.put(
                        JSONObject()
                            .put("date", day.toString())
                            .put("steps", steps.toDouble())
                            .put("kcal", Math.round(kcal).toDouble())
                            .put("kcalIsTotal", kcalIsTotal)
                            .put("km", Math.round(km * 100.0) / 100.0)
                            .put("sleepMin", sleepMin.toDouble())
                            .put("hrAvg", hrAvg.toDouble())
                            .put("hrRest", hrRest.toDouble())
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

    // ------------------------------------------------------------------ composição corporal

    @JavascriptInterface
    fun hasBodyPermissions(): Boolean {
        return try {
            val client = clientOrNull() ?: return false
            val granted = kotlinx.coroutines.runBlocking { client.permissionController.getGrantedPermissions() }
            granted.containsAll(BODY_CORE_PERMISSIONS)
        } catch (e: Throwable) {
            android.util.Log.e("DxHealth", "hasBodyPermissions FAILED: ${e.message}", e)
            false
        }
    }

    /** Lê TODOS os registros do tipo na janela (paginado: 1000 por página, mais antigos primeiro). */
    private suspend fun <T : Record> readAllOf(client: HealthConnectClient, type: kotlin.reflect.KClass<T>, start: Instant, end: Instant): List<T> {
        val out = ArrayList<T>(); var token: String? = null
        do {
            val resp = client.readRecords(
                androidx.health.connect.client.request.ReadRecordsRequest(
                    recordType = type,
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                    pageSize = 1000,
                    pageToken = token,
                )
            )
            out += resp.records; token = resp.pageToken
        } while (token != null)
        return out
    }

    /**
     * Avaliações de composição corporal dos últimos `daysBack` dias.
     * Uma avaliação = um registro de % DE GORDURA (é o que só a bioimpedância gera) + o peso
     * da MESMA origem medido a até 15 min dele. Basal entra se a mesma
     * origem tiver gravado na mesma janela; altura = a mais recente até a medição. Massa magra e água ficaram
     * de fora de propósito: o Galaxy Watch não as publica e cada permissão a mais é um item
     * a declarar no Play Console.
     * Pesagem solta (sem gordura) NÃO vira avaliação — não é bioimpedância.
     * event {type:"bodycomp", readings:[{time, origin, weightKg, bodyFatPct, bmrKcal?, heightCm?}]}
     */
    @JavascriptInterface
    fun bodyComposition(requestId: String, daysBack: Int) {
        val id = requestId.ifEmpty { "body-${requestSeq.incrementAndGet()}" }
        val client = clientOrNull()
        if (client == null) { dispatch(errorPayload(id, "unavailable")); return }
        scope.launch {
            try {
                val end: Instant = Instant.now()
                val start: Instant = end.minusSeconds(daysBack.coerceIn(1, 1095).toLong() * 86_400L)
                val granted = client.permissionController.getGrantedPermissions()
                if (!granted.containsAll(BODY_CORE_PERMISSIONS)) { dispatch(errorPayload(id, "permission")); return@launch }
                fun has(type: kotlin.reflect.KClass<out Record>) = granted.contains(HealthPermission.getReadPermission(type))

                val fats = readAllOf(client, BodyFatRecord::class, start, end)
                val weights = readAllOf(client, WeightRecord::class, start, end)
                val bmrs = if (has(BasalMetabolicRateRecord::class)) readAllOf(client, BasalMetabolicRateRecord::class, start, end) else emptyList()
                // Altura quase nunca muda: lê desde sempre (não só a janela).
                val heights = if (has(HeightRecord::class)) readAllOf(client, HeightRecord::class, Instant.EPOCH, end) else emptyList()

                val windowSec = 15 * 60L
                fun <T : Record> nearest(list: List<T>, origin: String, at: Instant, timeOf: (T) -> Instant): T? =
                    list.filter { it.metadata.dataOrigin.packageName == origin && kotlin.math.abs(timeOf(it).epochSecond - at.epochSecond) <= windowSec }
                        .minByOrNull { kotlin.math.abs(timeOf(it).epochSecond - at.epochSecond) }

                // Peso da avaliação, do mais confiável para o menos:
                //  1) mesma origem, a até 15 min (o caso normal: o aparelho grava os dois juntos);
                //  2) qualquer origem, a até 6 h (peso digitado em outro app no mesmo dia);
                //  3) o último peso conhecido até 60 dias antes (o relógio reaproveita o peso e o
                //     Samsung Health nem sempre regrava o registro a cada medição).
                // ANTES só valia o caso 1 e a medição era descartada EM SILÊNCIO (dono, 14/11:
                // "importou certo, mas não atualiza").
                fun weightFor(origin: String, at: Instant): Pair<WeightRecord, String>? {
                    nearest(weights, origin, at) { it.time }?.let { return it to "same" }
                    weights.filter { kotlin.math.abs(it.time.epochSecond - at.epochSecond) <= 6 * 3600L }
                        .minByOrNull { kotlin.math.abs(it.time.epochSecond - at.epochSecond) }?.let { return it to "near" }
                    weights.filter { !it.time.isAfter(at.plusSeconds(windowSec)) && it.time.isAfter(at.minusSeconds(60 * 86_400L)) }
                        .maxByOrNull { it.time }?.let { return it to "carried" }
                    return null
                }

                val arr = JSONArray()
                var unpaired = 0
                for (fat in fats) {
                    val origin = fat.metadata.dataOrigin.packageName
                    val picked = weightFor(origin, fat.time)
                    if (picked == null) { unpaired++; continue }
                    val weight = picked.first
                    val o = JSONObject()
                        .put("time", fat.time.toString())
                        .put("origin", origin)
                        .put("weightKg", weight.weight.inKilograms)
                        .put("weightFrom", picked.second)
                        .put("bodyFatPct", fat.percentage.value)
                    nearest(bmrs, origin, fat.time) { it.time }?.let { o.put("bmrKcal", it.basalMetabolicRate.inKilocaloriesPerDay) }
                    heights.filter { !it.time.isAfter(fat.time.plusSeconds(windowSec)) }.maxByOrNull { it.time }
                        ?.let { o.put("heightCm", it.height.inMeters * 100.0) }
                    arr.put(o)
                }
                android.util.Log.d("DxHealth", "bodyComposition: fats=${fats.size} weights=${weights.size} semPeso=$unpaired -> ${arr.length()} avaliações")
                // `stats` deixa a tela dizer o que o Health Connect tinha (diagnóstico sem cabo).
                val stats = JSONObject().put("fats", fats.size).put("weights", weights.size).put("unpaired", unpaired)
                fats.maxByOrNull { it.time }?.let { stats.put("latestFat", it.time.toString()) }
                dispatch(JSONObject().put("type", "bodycomp").put("requestId", id).put("readings", arr).put("stats", stats))
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
