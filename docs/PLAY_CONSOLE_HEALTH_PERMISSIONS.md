# Declarações de Permissões de Saúde — Google Play Console

> Copia e cola cada texto no campo correspondente do Play Console.
> Google exige no mínimo 1.000 caracteres — os textos abaixo têm ~1.500 cada.

---

## Etapas (READ_STEPS)

Nosso app "Dr. Exame" é um assistente de saúde que interpreta exames laboratoriais usando IA. Lemos a contagem diária de passos do Health Connect para exibir a atividade física do usuário junto com seus resultados de exames, criando contexto entre hábitos e saúde.

Uso específico:
1. Exibimos a média diária de passos no Dashboard (Hoje, 7 dias, 30 dias) com anel de progresso em relação à meta de 8.000 passos/dia recomendada pela OMS
2. Comparamos a atividade física ANTES e DEPOIS de cada exame laboratorial — quando o usuário tira um novo exame, mostramos "sua atividade aumentou 42% enquanto seu LDL caiu 16%" com a associação temporal apropriada (nunca afirmando causalidade)
3. Enviamos as médias de atividade como contexto para nossa IA gerar um relatório de saúde mais personalizado, com avisos explícitos de que é correlação educativa, não diagnóstico

A permissão é apenas de LEITURA — nunca escrevemos, alteramos ou deletamos dados de passos. O usuário concede a permissão explicitamente através do popup nativo do Health Connect e pode revogar a qualquer momento nas configurações do sistema. Os dados ficam no dispositivo do usuário até que ele opte por sincronizar com nosso servidor, e são usados exclusivamente para os recursos descritos acima.

---

## Distância (READ_DISTANCE)

Nosso app "Dr. Exame" é um assistente de saúde que interpreta exames laboratoriais usando IA. Lemos a distância diária percorrida do Health Connect para complementar o perfil de atividade física do usuário (junto com passos e calorias), fornecendo contexto para interpretação de exames.

Uso específico:
1. Exibimos a distância média diária (km) no Dashboard ao lado de passos e calorias, dando ao usuário uma visão completa de seu nível de atividade
2. Comparamos a distância percorrida entre exames laboratoriais — se o usuário estava caminhando mais quando seus triglicerídeos melhoraram, mostramos essa associação temporal com a devida ressalva científica
3. A distância ajuda a diferenciar tipos de atividade (caminhada externa vs. esteira) ao contextualizar resultados

A permissão é apenas de LEITURA — nunca escrevemos ou alteramos dados de distância. O usuário concede explicitamente e pode revogar a qualquer momento. Os dados são usados exclusivamente para os recursos de contextualização de saúde descritos acima.

---

## Exercícios (READ_EXERCISE)

Nosso app "Dr. Exame" é um assistente de saúde que interpreta exames laboratoriais usando IA. Lemos sessões de exercício do Health Connect para identificar períodos de atividade física estruturada (esteira, corrida, ciclismo) e mostrar se o usuário atende às diretrizes da OMS.

Uso específico:
1. Exibimos minutos de exercício formal por dia/semana no Dashboard, com referência à recomendação da OMS de 150-300 minutos/semana de atividade moderada
2. Identificamos padrões de exercício entre exames laboratoriais — "você se exercitou 3x mais desde seu último exame" — para fornecer contexto comportamental à interpretação dos resultados
3. A duração e frequência de exercício são indicadores mais confiáveis que contagem de calorias (que varia 20-40% entre dispositivos), então usamos minutos de exercício como principal métrica de atividade estruturada

A permissão é apenas de LEITURA. O usuário concede explicitamente através do Health Connect e pode revogar a qualquer momento. Os dados de sessão de exercício (tipo, duração, horário) são usados exclusivamente para os recursos de contextualização descritos.

---

## Calorias (READ_TOTAL_CALORIES_BURNED) — se aparecer

Nosso app "Dr. Exame" lê o gasto calórico diário do Health Connect como uma estimativa complementar de atividade física. Exibimos a média de kcal/dia no Dashboard com a etiqueta explícita de "estimativa registrada pelo dispositivo", pois reconhecemos que estimativas de calorias variam significativamente entre dispositivos. Usamos passos e minutos de exercício como métricas principais; calorias são apenas contexto visual. Permissão de leitura apenas, concedida explicitamente pelo usuário, revogável a qualquer momento.

---

## Frequência Cardíaca (READ_HEART_RATE) — se aparecer

Nosso app "Dr. Exame" lê a frequência cardíaca média e máxima diária do Health Connect para exibir tendências de condicionamento cardiovascular no Dashboard. A FC de repouso é um indicador bem estabelecido de condicionamento físico (estudos do European Journal of Preventive Cardiology). Mostramos a FC ao lado de exames cardiovasculares (perfil lipídico, pressão arterial) para fornecer contexto entre condicionamento físico e resultados laboratoriais. Permissão de leitura apenas, concedida explicitamente, revogável a qualquer momento.
