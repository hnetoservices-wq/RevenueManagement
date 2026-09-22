const exact = new Map<string, string>([
  ["Dashboard", "Painel geral"],
  ["Report Summary", "Resumo de relatórios"],
  ["Performance", "Desempenho"],
  ["Occupancy", "Ocupação"],
  ["Revenue", "Receita"],
  ["Pace & Pickup", "Ritmo e captação"],
  ["Imports", "Importações"],
  ["Settings", "Definições"],
  ["Booking Activity", "Atividade de reservas"],
  ["Stay-date Revenue", "Receita por data de estadia"],
  ["Property", "Propriedade"],
  ["Data as of", "Dados à data de"],
  ["+ Import report", "+ Importar relatório"],
  ["Import report", "Importar relatório"],
  ["Reading report…", "A ler relatório…"],
  ["Dismiss", "Fechar"],
  ["Local & private", "Local e privado"],
  ["No data leaves this computer", "Nenhum dado sai deste computador"],
  ["Local analytics", "Análise local"],
  ["Analysis filters", "Filtros de análise"],
  ["Shared across analytical pages", "Partilhados entre páginas de análise"],
  ["Channel", "Canal"],
  ["Room type", "Tipo de quarto"],
  ["Status", "Estado"],
  ["All channels", "Todos os canais"],
  ["All room types", "Todos os tipos de quarto"],
  ["All statuses", "Todos os estados"],
  ["Active only", "Apenas ativas"],
  ["Cancelled only", "Apenas canceladas"],
  ["Reset", "Repor"],
  ["Estimated room-type revenue", "Receita estimada por tipo de quarto"],
  ["From", "De"],
  ["To", "Até"],
  ["Booked from", "Reservado de"],
  ["Booked to", "Reservado até"],
  ["Incl. tax", "Incl. impostos"],
  ["Excl. tax", "Excl. impostos"],
  ["Compare", "Comparar"],
  ["Previous year", "Ano anterior"],
  ["Previous period", "Período anterior"],
  ["None", "Sem comparação"],
  ["PY", "Ano anterior"],
  ["Prev. period", "Período anterior"],
  ["Comparison", "Comparação"],
  ["ADR", "ADR (Tarifa média diária)"],
  ["RevPAR", "RevPAR (Receita por quarto disponível)"],
  ["Average LOS", "Duração média da estadia"],
  ["LOS", "Duração da estadia"],
  ["Average lead time", "Antecedência média da reserva"],
  ["Median lead time", "Mediana da antecedência da reserva"],
  ["Median LOS", "Mediana da duração da estadia"],
  ["Cancellation rate", "Taxa de cancelamento"],
  ["Room revenue", "Receita de alojamento"],
  ["Total revenue", "Receita total"],
  ["Extra revenue", "Receita de extras"],
  ["Tourist tax", "Taxa turística"],
  ["Room nights sold", "Noites-quarto vendidas"],
  ["Room nights", "Noites-quarto"],
  ["Available room nights", "Noites-quarto disponíveis"],
  ["Reservations", "Reservas"],
  ["Bookings", "Reservas"],
  ["Bookings created", "Reservas criadas"],
  ["Room nights booked", "Noites-quarto reservadas"],
  ["Room revenue booked", "Receita de alojamento reservada"],
  ["Booked ADR", "ADR (Tarifa média diária) das reservas"],
  ["Configured inventory", "Inventário configurado"],
  ["No comparison", "Sem comparação"],
  ["No comparable base", "Sem base comparável"],
  ["Insufficient comparison data", "Dados de comparação insuficientes"],
  ["Comparison data is insufficient", "Os dados de comparação são insuficientes"],
  ["Selected period", "Período selecionado"],
  ["Compared with", "Comparado com"],
  ["Comparison coverage", "Cobertura da comparação"],
  ["Coverage", "Cobertura"],
  ["Reliable", "Fiável"],
  ["Partial", "Parcial"],
  ["Insufficient", "Insuficiente"],
  ["Current occupancy", "Ocupação atual"],
  ["Current", "Atual"],
  ["Prior year", "Ano anterior"],
  ["Room revenue only", "Apenas receita de alojamento"],
  ["Monthly view", "Vista mensal"],
  ["Weekly view", "Vista semanal"],
  ["Daily view", "Vista diária"],
  ["Monthly performance", "Desempenho mensal"],
  ["Month", "Mês"],
  ["Sold", "Vendidas"],
  ["Available", "Disponíveis"],
  ["Share", "Peso"],
  ["Top revenue dates", "Datas com maior receita"],
  ["Highest-demand dates", "Datas com maior procura"],
  ["Lowest-demand dates", "Datas com menor procura"],
  ["Daily occupancy calendar", "Calendário diário de ocupação"],
  ["Weekday pattern", "Padrão por dia da semana"],
  ["Occupancy by room type", "Ocupação por tipo de quarto"],
  ["Room-night demand trend", "Tendência da procura em noites-quarto"],
  ["Demand analysis", "Análise da procura"],
  ["Commercial analysis", "Análise comercial"],
  ["Stay-date analysis", "Análise por data de estadia"],
  ["Booking-date analysis", "Análise por data de reserva"],
  ["Revenue overview", "Visão geral da receita"],
  ["Historical intelligence", "Análise histórica"],
  ["Days before arrival", "Dias antes da chegada"],
  ["What changed", "O que mudou"],
  ["Data history", "Histórico de dados"],
  ["Executive comparison", "Comparação executiva"],
  ["Property setup", "Configuração da propriedade"],
  ["Add property", "Adicionar propriedade"],
  ["+ Add property", "+ Adicionar propriedade"],
  ["Create property", "Criar propriedade"],
  ["Save changes", "Guardar alterações"],
  ["Saving…", "A guardar…"],
  ["Cancel", "Cancelar"],
  ["General property information", "Informação geral da propriedade"],
  ["Property name", "Nome da propriedade"],
  ["Currency", "Moeda"],
  ["Timezone", "Fuso horário"],
  ["Number of rooms", "Número de quartos"],
  ["Import source", "Origem da importação"],
  ["Amenitiz reservation report", "Relatório de reservas Amenitiz"],
  ["CSV room matching", "Correspondência de quartos no CSV (valores separados por vírgulas)"],
  ["Configured inventory", "Inventário configurado"],
  ["Example", "Exemplo"],
  ["Room types", "Tipos de quarto"],
  ["+ Add room type", "+ Adicionar tipo de quarto"],
  ["Room name in Amenitiz", "Nome do quarto no Amenitiz"],
  ["Quantity", "Quantidade"],
  ["Setup needs attention", "A configuração necessita de atenção"],
  ["Importing into", "A importar para"],
  ["Review snapshot", "Rever relatório"],
  ["Amenitiz import", "Importação Amenitiz"],
  ["Processed", "Processadas"],
  ["Valid", "Válidas"],
  ["Warnings", "Avisos"],
  ["Excluded", "Excluídas"],
  ["Validation issues", "Problemas de validação"],
  ["No validation issues found.", "Não foram encontrados problemas de validação."],
  ["Choose XLSX or CSV", "Escolher XLSX (folha de cálculo) ou CSV (valores separados por vírgulas)"],
  ["Expected file: Amenitiz reservation report", "Ficheiro esperado: relatório de reservas Amenitiz"],
  ["First snapshot", "Primeiro relatório"],
  ["Snapshot comparison", "Comparação de relatórios"],
  ["Baseline snapshot", "Relatório de referência"],
  ["Later snapshot", "Relatório posterior"],
  ["Compare from", "Comparar desde"],
  ["Most recent report", "Relatório mais recente"],
  ["Occupancy change", "Variação da ocupação"],
  ["ADR change", "Variação do ADR (Tarifa média diária)"],
  ["RevPAR change", "Variação do RevPAR (Receita por quarto disponível)"],
  ["Room revenue pickup", "Captação de receita de alojamento"],
  ["Reservations pickup", "Captação de reservas"],
  ["Room nights pickup", "Captação de noites-quarto"],
  ["Pickup decomposition", "Decomposição da captação"],
  ["New bookings", "Novas reservas"],
  ["Cancellations", "Cancelamentos"],
  ["Modifications", "Alterações"],
  ["Removed from report", "Removidas do relatório"],
  ["Net pickup", "Captação líquida"],
  ["Reservation", "Reserva"],
  ["Change", "Alteração"],
  ["Stay before", "Estadia anterior"],
  ["Stay after", "Estadia posterior"],
  ["Changed fields", "Campos alterados"],
  ["Revenue Δ", "Variação da receita"],
  ["Occ. Δ", "Variação da ocupação"],
  ["ADR Δ", "Variação do ADR (Tarifa média diária)"],
  ["RevPAR Δ", "Variação do RevPAR (Receita por quarto disponível)"],
  ["Comp. coverage", "Cobertura da comparação"],
  ["RN Δ", "Variação das noites-quarto"],
  ["RN pickup", "Captação de noites-quarto"],
  ["Occ. pickup", "Captação de ocupação"],
  ["Revenue pickup", "Captação de receita"],
  ["Booking position over time", "Posição das reservas ao longo do tempo"],
  ["Latest booking position", "Posição de reservas mais recente"],
  ["Net room-night pickup", "Captação líquida de noites-quarto"],
  ["Net occupancy pickup", "Captação líquida de ocupação"],
  ["Net room-revenue pickup", "Captação líquida de receita de alojamento"],
  ["Lead point", "Antecedência"],
  ["OTB occupancy", "Ocupação em carteira"],
  ["Avg. snapshot lag", "Atraso médio do relatório"],
  ["Snapshot-by-snapshot pickup", "Captação entre relatórios"],
  ["Booking production", "Produção de reservas"],
  ["Booked-value summary", "Resumo do valor reservado"],
  ["Where this production is staying", "Meses de estadia desta produção"],
  ["Bookings by channel", "Reservas por canal"],
  ["Room-type mix", "Distribuição por tipo de quarto"],
  ["Total booked value", "Valor total reservado"],
  ["Revenue & rate trend", "Tendência da receita e tarifa"],
  ["Revenue mix", "Composição da receita"],
  ["Channel contribution", "Contributo por canal"],
  ["Monthly revenue", "Receita mensal"],
  ["Closed", "Fechado"],
  ["No change", "Sem alterações"],
  ["Occupancy unchanged", "Ocupação manteve-se"],
  ["Earlier snapshot", "Relatório anterior"],
  ["Later snapshot", "Relatório posterior"],
  ["Data as of", "Dados à data de"],
  ["Filename", "Nome do ficheiro"],
  ["Imported", "Importado"],
  ["Rows", "Linhas"],
  ["Import report", "Importar relatório"],
]);

const replacements: Array<[RegExp, string]> = [
  [/\bADR\b/g, "ADR (Tarifa média diária)"],
  [/\bRevPAR\b/g, "RevPAR (Receita por quarto disponível)"],
  [/\bLOS\b/g, "duração da estadia"],
  [/\bPY\b/g, "ano anterior"],
  [/\bSTLY\b/g, "mesmo momento do ano anterior"],
  [/\bOTB\b/g, "reservas em carteira"],
  [/\bRN\b/g, "noites-quarto"],
  [/\bpp\b/g, "pontos percentuais"],
  [/\broom nights\b/gi, "noites-quarto"],
  [/\broom night\b/gi, "noite-quarto"],
  [/\broom revenue\b/gi, "receita de alojamento"],
  [/\btourist tax\b/gi, "taxa turística"],
  [/\bextra revenue\b/gi, "receita de extras"],
  [/\bbookings\b/gi, "reservas"],
  [/\breservations\b/gi, "reservas"],
  [/\bbooking date\b/gi, "data de reserva"],
  [/\bstay dates\b/gi, "datas de estadia"],
  [/\bstay date\b/gi, "data de estadia"],
  [/\bcoverage\b/gi, "cobertura"],
  [/\breliable\b/gi, "fiável"],
  [/\bpartial\b/gi, "parcial"],
  [/\binsufficient\b/gi, "insuficiente"],
  [/\bactive\b/gi, "ativa"],
  [/\bcancelled\b/gi, "cancelada"],
  [/\bmodified\b/gi, "alterada"],
  [/\bstatus\b/gi, "estado"],
  [/\bextras\b/gi, "extras"],
  [/\bnew reservation\b/gi, "nova reserva"],
  [/\bnew bookings\b/gi, "novas reservas"],
  [/\bcancellations\b/gi, "cancelamentos"],
  [/\bmodifications\b/gi, "alterações"],
  [/\bremoved from report\b/gi, "removidas do relatório"],
  [/\bfirst to latest snapshot\b/gi, "do primeiro ao relatório mais recente"],
  [/\bsnapshot\b/gi, "relatório"],
  [/\bsnapshots\b/gi, "relatórios"],
  [/\bsold-out days?\b/gi, "dias esgotados"],
  [/\bcovered stay dates\b/gi, "datas de estadia cobertas"],
  [/\brooms sold\b/gi, "quartos vendidos"],
  [/\brooms\b/gi, "quartos"],
  [/\bdays\b/gi, "dias"],
  [/\bnights\b/gi, "noites"],
  [/\bD-(\d+)\b/g, "$1 dias antes"],
];

const monthReplacements: Array<[RegExp, string]> = [
  [/\bJanuary\b/g, "Janeiro"], [/\bFebruary\b/g, "Fevereiro"], [/\bMarch\b/g, "Março"],
  [/\bApril\b/g, "Abril"], [/\bMay\b/g, "Maio"], [/\bJune\b/g, "Junho"],
  [/\bJuly\b/g, "Julho"], [/\bAugust\b/g, "Agosto"], [/\bSeptember\b/g, "Setembro"],
  [/\bOctober\b/g, "Outubro"], [/\bNovember\b/g, "Novembro"], [/\bDecember\b/g, "Dezembro"],
  [/\bMay(?=\s+\d{4})/g, "Mai"], [/\bAug(?=\s+\d{4})/g, "Ago"], [/\bSep(?=\s+\d{4})/g, "Set"],
  [/\bOct(?=\s+\d{4})/g, "Out"], [/\bDec(?=\s+\d{4})/g, "Dez"], [/\bApr(?=\s+\d{4})/g, "Abr"],
  [/\bSun\b/g, "Dom"], [/\bMon\b/g, "Seg"], [/\bTue\b/g, "Ter"], [/\bWed\b/g, "Qua"],
  [/\bThu\b/g, "Qui"], [/\bFri\b/g, "Sex"], [/\bSat\b/g, "Sáb"],
];

function preserveWhitespace(original: string, translated: string) {
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

export function translateUiText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const direct = exact.get(trimmed);
  if (direct) return preserveWhitespace(value, direct);

  let translated = trimmed;
  for (const [pattern, replacement] of monthReplacements) translated = translated.replace(pattern, replacement);
  for (const [pattern, replacement] of replacements) translated = translated.replace(pattern, replacement);

  return translated === trimmed ? value : preserveWhitespace(value, translated);
}

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style")) return;
    const next = translateUiText(node.nodeValue ?? "");
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }

  if (!(node instanceof HTMLElement)) return;
  for (const attribute of ["placeholder", "title", "aria-label"]) {
    const value = node.getAttribute(attribute);
    if (!value) continue;
    const next = translateUiText(value);
    if (next !== value) node.setAttribute(attribute, next);
  }
  node.childNodes.forEach(translateNode);
}

function translateCalendarWeekdays(root: ParentNode = document) {
  root.querySelectorAll(".occupancy-weekdays").forEach((row) => {
    const labels = ["D", "S", "T", "Q", "Q", "S", "S"];
    Array.from(row.children).forEach((child, index) => {
      if (labels[index] && child.textContent !== labels[index]) child.textContent = labels[index];
    });
  });
}

let installed = false;

export function initPortugueseUi() {
  document.documentElement.lang = "pt-PT";
  if (installed) return;

  translateNode(document.body);
  translateCalendarWeekdays();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") translateNode(mutation.target);
      mutation.addedNodes.forEach(translateNode);
      if (mutation.type === "attributes") translateNode(mutation.target);
    }
    translateCalendarWeekdays();
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["placeholder", "title", "aria-label"],
  });
  installed = true;
}
