// Dicionário de explicações em LINGUAGEM DE LEIGO para os exames mais comuns.
// Estilo: simples, com analogia, responsável (NÃO diagnóstica).
// Chaves = nameCanonical (maiúsculas, sem acento; mesmo padrão do backend).

export interface ExamExplain {
  titulo: string;
  resumo: string;     // 1 linha: o que é
  analogia: string;   // comparação simples
  alterado: string;   // alterado pode indicar (responsável, não-diagnóstico)
}

export const EXAM_DICTIONARY: Record<string, ExamExplain> = {
  HEMOGLOBINA: {
    titulo: 'Hemoglobina',
    resumo: 'A "tinta vermelha" do sangue que carrega o oxigênio.',
    analogia: 'É o motorzinho dentro dos carrinhos (hemácias) que entregam oxigênio no corpo.',
    alterado: 'Baixa pode indicar anemia (sangue "fraco"). Alta pode vir de desidratação ou de uso de testosterona. Avalie com o médico.',
  },
  HEMATOCRITO: {
    titulo: 'Hematócrito',
    resumo: 'A porcentagem do sangue ocupada pelas células vermelhas.',
    analogia: 'Se o sangue fosse um suco, o hematócrito é quanto dele é "polpa" vs água.',
    alterado: 'Alto pode engrossar o sangue (atenção em uso de testosterona). Baixo pode indicar anemia. Veja com o médico.',
  },
  HEMACIAS: {
    titulo: 'Hemácias',
    resumo: 'As células vermelhas que transportam oxigênio.',
    analogia: 'São os "carrinhos de entrega" de oxigênio do corpo.',
    alterado: 'Poucas pode indicar anemia. Veja junto com hemoglobina e hematócrito.',
  },
  VCM: {
    titulo: 'VCM (Volume Corpuscular Médio)',
    resumo: 'O tamanho médio das hemácias.',
    analogia: 'Mede se os "carrinhos" são grandes, pequenos ou do tamanho certo.',
    alterado: 'Hemácias pequenas ou grandes ajudam o médico a entender o tipo de anemia, se houver.',
  },
  HCM: {
    titulo: 'HCM (Hemoglobina Corpuscular Média)',
    resumo: 'Quanto de hemoglobina cada hemácia carrega.',
    analogia: 'É a "carga" que cada carrinho leva.',
    alterado: 'Baixa ou alta ajuda a classificar anemias. Sozinho não diz muito.',
  },
  CHCM: {
    titulo: 'CHCM (Concentração de Hemoglobina)',
    resumo: 'A concentração de hemoglobina dentro das hemácias.',
    analogia: 'Mede se os carrinhos estão bem "tintos" de vermelho para levar oxigênio.',
    alterado: 'Alterações aparecem em alguns tipos de anemia. Veja com o hemograma completo e o médico.',
  },
  RDW: {
    titulo: 'RDW',
    resumo: 'Se as hemácias têm tamanhos parecidos ou muito variados.',
    analogia: 'Mede se os carrinhos são todos do mesmo tamanho ou se tem de vários tamanhos.',
    alterado: 'Tamanhos muito variados podem indicar que o sangue está se renovando. Avalie com o médico.',
  },
  LEUCOCITOS: {
    titulo: 'Leucócitos (glóbulos brancos)',
    resumo: 'As células de defesa do corpo.',
    analogia: 'São os "soldadinhos" que protegem contra infecções.',
    alterado: 'Altos podem indicar infecção/inflamação; baixos deixam o corpo mais vulnerável. Veja com o médico.',
  },
  NEUTROFILOS: {
    titulo: 'Neutrófilos',
    resumo: 'Os soldados de defesa que chegam primeiro nas bactérias.',
    analogia: 'São a "linha de frente" contra infecções bacterianas.',
    alterado: 'Sobem em infecções bacterianas. Variações pequenas geralmente não são preocupantes.',
  },
  LINFOCITOS: {
    titulo: 'Linfócitos',
    resumo: 'Defensores especializados, principalmente contra vírus.',
    analogia: 'São os "soldados inteligentes" que criam memória contra vírus.',
    alterado: 'Sobem em infecções virais. Veja o conjunto dos glóbulos brancos com o médico.',
  },
  MONOCITOS: {
    titulo: 'Monócitos',
    resumo: 'Defensores que "limpam" o que sobra das batalhas.',
    analogia: 'São a "equipe de limpeza" do sistema de defesa.',
    alterado: 'Podem subir em inflamações crônicas. Variações leves costumam ser normais.',
  },
  EOSINOFILOS: {
    titulo: 'Eosinófilos',
    resumo: 'Defensores ligados a alergias e parasitas.',
    analogia: 'Entram em ação em crises alérgicas.',
    alterado: 'Altos podem indicar alergia ou parasitas. Converse com o médico.',
  },
  BASOFILOS: {
    titulo: 'Basófilos',
    resumo: 'Um tipo raro de defensor, ligado a alergias.',
    analogia: 'Ajudam na resposta alérgica do corpo.',
    alterado: 'Variações costumam não ter significado clínico isolado.',
  },
  PLAQUETAS: {
    titulo: 'Plaquetas',
    resumo: 'As células que fazem o sangue coagular (estancar sangramentos).',
    analogia: 'São os "soldadinhos reparadores" que tapam buracos nos vasos.',
    alterado: 'Muito baixas aumentam o risco de sangramento; muito altas, de coágulos. Veja com o médico.',
  },
  GLICEMIA: {
    titulo: 'Glicemia (glicose em jejum)',
    resumo: 'A quantidade de açúcar no sangue.',
    analogia: 'É o "combustível" que comemos circulando no sangue.',
    alterado: 'Alta pode indicar pré-diabetes ou diabetes. Veja com o médico, especialmente se houver histórico.',
  },
  HEMOGLOBINA_GLICADA: {
    titulo: 'Hemoglobina Glicada (HbA1c)',
    resumo: 'A média do açúcar no sangue dos últimos ~3 meses.',
    analogia: 'É a "média das notas" da glicemia, não só a foto de um dia.',
    alterado: 'Mostra como está o controle do açúcar ao longo do tempo. Excelente sinal de controle.',
  },
  COLESTEROL_TOTAL: {
    titulo: 'Colesterol Total',
    resumo: 'A soma do colesterol no sangue.',
    analogia: 'É a "gordura" que circula; em excesso pode entupir canos (vasos).',
    alterado: 'Alto aumenta o risco cardiovascular a longo prazo. Veja com o médico.',
  },
  LDL: {
    titulo: 'LDL ("colesterol ruim")',
    resumo: 'O colesterol que pode se depositar nas paredes dos vasos.',
    analogia: 'É a "gordura que entope" os canos do corpo aos poucos.',
    alterado: 'Alto é fator de risco para o coração a longo prazo. Meta costuma ser < 100. Veja com o médico.',
  },
  HDL: {
    titulo: 'HDL ("colesterol bom")',
    resumo: 'O colesterol que AJUDA a limpar os vasos.',
    analogia: 'É a "equipe de limpeza" que tira a gordura dos canos.',
    alterado: 'Baixo reduz a proteção do coração. Exercício ajuda a subir.',
  },
  TRIGLICERIDES: {
    titulo: 'Triglicérides',
    resumo: 'Outro tipo de gordura no sangue, muito ligado à alimentação.',
    analogia: 'Sobe muito depois de comer gordura/açúcar ou beber álcool.',
    alterado: 'Alto está ligado a dieta e risco cardiovascular. Pode cair rápido mudando a alimentação.',
  },
  CREATININA: {
    titulo: 'Creatinina',
    resumo: 'Mostra como os rins estão filtrando o sangue.',
    analogia: 'É um "resíduo" que os rins devem jogar fora; se acumula, rim pode estar devagar.',
    alterado: 'Alta pode indicar que os rins estão filtrando menos. Veja com o médico.',
  },
  UREIA: {
    titulo: 'Ureia',
    resumo: 'Outro resíduo que os rins eliminam.',
    analogia: 'Junta com a creatinina para avaliar os rins.',
    alterado: 'Alta pode indicar função renal reduzida ou desidratação.',
  },
  TGO: {
    titulo: 'TGO / AST',
    resumo: 'Uma enzima que indica como está o fígado (e o coração/músculo).',
    analogia: 'É um "alarme" que dispara quando células do fígado estão sendo agredidas.',
    alterado: 'Elevada pode indicar sobrecarga no fígado. Veja com o médico.',
  },
  TGP: {
    titulo: 'TGP / ALT',
    resumo: 'Enzima bem específica do fígado.',
    analogia: 'É o "termômetro" mais fiel do fígado.',
    alterado: 'Elevada sugere que o fígado está sendo agredido (gordura, medicação, etc.).',
  },
  GAMA_GT: {
    titulo: 'Gama-GT (GGT)',
    resumo: 'Enzima que sobe com sobrecarga no fígado, álcool ou medicações.',
    analogia: 'Funciona como um "sensor" de esforço do fígado.',
    alterado: 'Elevada costuma baixar ao reduzir álcool/ajustar medicação. Converse com o médico.',
  },
  TSH: {
    titulo: 'TSH',
    resumo: 'Hormônio que mostra como a tireoide está trabalhando.',
    analogia: 'É o "chamado" que o cérebro faz para a tireoide produzir hormônio.',
    alterado: 'Alto pode indicar tireoide lenta; baixo, tireoide acelerada. Em quem não tem tireoide, orienta a dose do remédio.',
  },
  T4_LIVRE: {
    titulo: 'T4 Livre',
    resumo: 'O hormônio da tireoide que está circulando ativo.',
    analogia: 'É o "gás" que a tireoide libera pro corpo funcionar.',
    alterado: 'Mostra o efeito real da tireoide (ou da reposição, como o Levoid).',
  },
  FERRITINA: {
    titulo: 'Ferritina',
    resumo: 'A reserva de ferro do corpo.',
    analogia: 'É o "estoque" de ferro guardado para fabricar sangue.',
    alterado: 'Baixa = reserva pequena (risco de anemia). Alta pode ter outras causas. Veja com o médico.',
  },
  VITAMINA_D: {
    titulo: 'Vitamina D',
    resumo: 'Vitamina importante para ossos, imunidade e disposição.',
    analogia: 'O corpo fabrica com sol; pouca exposição = estoque baixo.',
    alterado: 'Baixa é comum e pode causar cansaço. Meta costuma ser acima de 30. Veja com o médico.',
  },
  VITAMINA_B12: {
    titulo: 'Vitamina B12',
    resumo: 'Vitamina essencial para nervos e produção de sangue.',
    analogia: 'Combustível para os nervos e para formar hemácias saudáveis.',
    alterado: 'Baixa pode causar cansaço e formigamento. Veja com o médico.',
  },
  ACIDO_URICO: {
    titulo: 'Ácido Úrico',
    resumo: 'Substância que sobra da digestão de carnes/bebidas.',
    analogia: 'Em excesso pode formar "cristais" nas juntas (gota).',
    alterado: 'Alto pode causar dor articular (gota) ou pedra no rim. Veja com o médico.',
  },
  PSA: {
    titulo: 'PSA (próstata)',
    resumo: 'Exame de rastreio da próstata em homens.',
    analogia: 'É um "termômetro" que o médico usa para avaliar a próstata.',
    alterado: 'Subidas merecem conversa com o urologista, mas não significam doença por si só.',
  },
  HOMA_IR: {
    titulo: 'HOMA-IR',
    resumo: 'Calcula a resistência do corpo à insulina.',
    analogia: 'Mostra se o corpo está "surdo" à insulina (sinal de pré-diabetes).',
    alterado: 'Alto sugere resistência à insulina. Veja com o médico.',
  },
};

/** Busca explicação por chave canônica (com fallback simples). */
export function explainExam(nameCanonical: string): ExamExplain | null {
  return EXAM_DICTIONARY[nameCanonical] ?? null;
}
