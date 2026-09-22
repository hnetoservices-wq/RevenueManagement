const phrases = new Map<string, string>([
  ["Stay-date performance and previous-year comparison.", "Desempenho por data de estadia e comparação com o ano anterior."],
  ["Revenue and occupancy", "Receita e ocupação"],
  ["Revenue by channel", "Receita por canal"],
  ["Operational summary", "Resumo operacional"],
  ["Selected stay dates", "Datas de estadia selecionadas"],
  ["Import your Amenitiz reservation report", "Importe o relatório de reservas do Amenitiz"],
  ["The report will be validated locally. Guest names and contact details will not be saved.", "O relatório será validado localmente. Os nomes e contactos dos hóspedes não serão guardados."],
  ["Every import is preserved as an immutable historical snapshot.", "Cada importação é preservada como um registo histórico imutável."],
  ["Pickup becomes available after a second import", "A captação fica disponível após uma segunda importação"],
  ["Import another Amenitiz report on a later date to measure how room nights, occupancy and revenue changed between booking positions.", "Importe outro relatório do Amenitiz com uma data posterior para medir a variação das noites-quarto, ocupação e receita entre posições de reservas."],
  ["Measure pickup for the same stay dates between two booking positions.", "Meça a captação para as mesmas datas de estadia entre duas posições de reservas."],
  ["No snapshots imported yet.", "Ainda não existem relatórios importados."],
  ["Select two different snapshots.", "Selecione dois relatórios diferentes."],
  ["Calculating snapshot pickup…", "A calcular a captação entre relatórios…"],
  ["Only analytics fields will be stored. Guest names, email addresses, phone numbers, addresses, requests, and comments are discarded.", "Apenas serão guardados campos analíticos. Nomes, endereços de correio eletrónico, números de telefone, moradas, pedidos e comentários dos hóspedes são descartados."],
  ["Analyse occupancy, rate and revenue performance for the latest booking-position snapshot.", "Analise o desempenho da ocupação, tarifa e receita na posição de reservas mais recente."],
  ["Cancelled reservation analysis", "Análise de reservas canceladas"],
  ["Reservation count, LOS and lead time describe cancelled bookings. Cancelled stays remain excluded from occupancy, sold room nights, ADR, RevPAR and revenue.", "O número de reservas, a duração da estadia e a antecedência descrevem as reservas canceladas. As estadias canceladas continuam excluídas da ocupação, noites-quarto vendidas, ADR (Tarifa média diária), RevPAR (Receita por quarto disponível) e receita."],
  ["Selected-period data is incomplete", "Os dados do período selecionado estão incompletos"],
  ["Comparison period is partially covered", "O período de comparação está parcialmente coberto"],
  ["Occupancy trend", "Tendência da ocupação"],
  ["ADR & RevPAR trend", "Tendência do ADR (Tarifa média diária) e RevPAR (Receita por quarto disponível)"],
  ["Calendar-month segments within the selected stay period. Comparison deltas require reliable coverage.", "Segmentos mensais dentro do período de estadia selecionado. As variações de comparação exigem cobertura fiável."],
  ["Analyse room-night utilisation and on-the-books demand across the selected stay dates.", "Analise a utilização das noites-quarto e a procura em carteira nas datas de estadia selecionadas."],
  ["Cancelled reservations do not consume sold room nights. Occupancy therefore remains 0%; use Active only or All statuses for operational occupancy analysis.", "As reservas canceladas não consomem noites-quarto vendidas. A ocupação permanece, por isso, em 0%; utilize Apenas ativas ou Todos os estados para analisar a ocupação operacional."],
  ["Occupancy deltas and comparison lines require at least 80% coverage.", "As variações de ocupação e linhas de comparação exigem pelo menos 80% de cobertura."],
  ["current booking position", "posição atual das reservas"],
  ["Occupancy by stay-night weekday", "Ocupação por dia da semana da noite de estadia"],
  ["Exact room-night utilisation using each room type's configured inventory.", "Utilização exata das noites-quarto com base no inventário configurado de cada tipo de quarto."],
  ["Top OTB occupancy in the selected period", "Maior ocupação em carteira no período selecionado"],
  ["Lowest OTB occupancy in the selected period", "Menor ocupação em carteira no período selecionado"],
  ["On-the-books occupancy for each covered stay date. Future dates are booking position, not final realised occupancy.", "Ocupação em carteira para cada data de estadia coberta. As datas futuras representam a posição atual das reservas, não a ocupação final realizada."],
  ["Analyse room revenue, rate, revenue mix, and channel contribution across the selected stay dates.", "Analise a receita de alojamento, tarifa, composição da receita e contributo dos canais nas datas de estadia selecionadas."],
  ["Cancelled reservations remain excluded from room revenue, ADR, RevPAR, extras, tourist tax, and total revenue. Use Active only or All statuses for operational revenue analysis.", "As reservas canceladas continuam excluídas da receita de alojamento, ADR (Tarifa média diária), RevPAR (Receita por quarto disponível), extras, taxa turística e receita total. Utilize Apenas ativas ou Todos os estados para analisar a receita operacional."],
  ["Headline revenue deltas require at least 80% coverage; reliable monthly segments may still compare individually.", "As principais variações de receita exigem pelo menos 80% de cobertura; os meses com cobertura fiável podem continuar a ser comparados individualmente."],
  ["Composition of selected-period revenue", "Composição da receita do período selecionado"],
  ["Exact room-revenue contribution from active reservations in the selected period.", "Contributo exato da receita de alojamento proveniente de reservas ativas no período selecionado."],
  ["Stay-month room revenue, rate, and room nights.", "Receita de alojamento, tarifa e noites-quarto por mês de estadia."],
  ["Highest room revenue by stay date", "Maior receita de alojamento por data de estadia"],
  ["Reconstruct booking production from reservation booking dates in the latest snapshot.", "Reconstrua a produção de reservas a partir das datas de reserva registadas no relatório mais recente."],
  ["Reconstructed booking activity", "Atividade de reservas reconstruída"],
  ["Values are attributed to each reservation's current recorded booking date. Later modifications can change the value now associated with the original booking date; this is not a historical snapshot of the reservation at creation.", "Os valores são atribuídos à data de reserva atualmente registada em cada reserva. Alterações posteriores podem modificar o valor agora associado à data de reserva original; isto não representa o estado histórico da reserva no momento da criação."],
  ["Selected booking period is only partially observed", "O período de reservas selecionado está apenas parcialmente observado"],
  ["Dates outside the booking-date range present in the latest dataset are treated as unknown, not zero production.", "As datas fora do intervalo de datas de reserva presente no conjunto de dados mais recente são tratadas como desconhecidas e não como produção zero."],
  ["This view describes bookings that are currently cancelled. Their recorded booking value is historical booking production, not expected realised revenue.", "Esta vista descreve reservas que estão atualmente canceladas. O valor registado representa produção histórica de reservas e não receita realizada esperada."],
  ["With All statuses selected, booking production includes reservations that were created in the period but are currently cancelled.", "Com Todos os estados selecionado, a produção inclui reservas criadas no período que se encontram atualmente canceladas."],
  ["production by booking date", "produção por data de reserva"],
  ["Full current recorded value of bookings created in the selected period", "Valor total atualmente registado das reservas criadas no período selecionado"],
  ["Room revenue and room nights booked in the selected booking period, allocated across actual stay months.", "Receita de alojamento e noites-quarto reservadas no período selecionado, distribuídas pelos meses efetivos de estadia."],
  ["Full booking value grouped by source channel.", "Valor total das reservas agrupado por canal de origem."],
  ["Exact room-night production by booked room type.", "Produção exata de noites-quarto por tipo de quarto reservado."],
  ["Track how the selected stay period built across every imported booking-position snapshot.", "Acompanhe a evolução do período de estadia selecionado em cada posição de reservas importada."],
  ["At least two snapshots are required", "São necessários pelo menos dois relatórios"],
  ["Import historical Amenitiz reports with different data-as-of dates to build a booking pace curve and measure pickup.", "Importe relatórios históricos do Amenitiz com diferentes datas de referência para construir uma curva de ritmo de reservas e medir a captação."],
  ["OTB occupancy and room revenue for the selected stay dates", "Ocupação em carteira e receita de alojamento para as datas de estadia selecionadas"],
  ["Lead-time pace vs same time last year", "Ritmo por antecedência comparado com o mesmo momento do ano anterior"],
  ["Dashed = partial coverage", "Tracejado = cobertura parcial"],
  ["No prior-year historical booking-position coverage is available for this stay period.", "Não existe cobertura histórica da posição de reservas do ano anterior para este período de estadia."],
  ["Raw values remain visible even when coverage is too low to plot.", "Os valores brutos permanecem visíveis mesmo quando a cobertura é demasiado baixa para serem apresentados no gráfico."],
  ["No lead-time points could be calculated for the selected stay period.", "Não foi possível calcular pontos de antecedência para o período de estadia selecionado."],
  ["Each row compares that booking position with the immediately previous imported snapshot.", "Cada linha compara essa posição de reservas com o relatório importado imediatamente anterior."],
  ["Explain net pickup by matching reservation IDs between two booking-position snapshots.", "Explique a captação líquida através da correspondência dos identificadores das reservas entre duas posições de reservas."],
  ["Choose a later snapshot after the earlier snapshot.", "Escolha um relatório posterior ao relatório inicial."],
  ["Matching reservations and reconciling pickup…", "A cruzar reservas e reconciliar a captação…"],
  ["Category totals reconcile to the selected snapshot pair.", "Os totais das categorias reconciliam com o par de relatórios selecionado."],
  ["No reservation-level changes affected the selected stay period.", "Nenhuma alteração ao nível das reservas afetou o período de estadia selecionado."],
  ["See exactly what changed between a selected historical report and the most recent snapshot.", "Veja exatamente o que mudou entre um relatório histórico selecionado e o relatório mais recente."],
  ["A second report is needed", "É necessário um segundo relatório"],
  ["Import another report on a later date to unlock the quick report comparison.", "Importe outro relatório com uma data posterior para ativar a comparação rápida de relatórios."],
  ["Latest OTB position with change since the selected baseline report.", "Posição em carteira mais recente e variação desde o relatório de referência selecionado."],
  ["Current annual OTB contribution and movement since the selected report.", "Contributo anual atual em carteira e evolução desde o relatório selecionado."],
  ["Configure the property and the exact room names used by Amenitiz before importing reservation reports.", "Configure a propriedade e os nomes exatos dos quartos utilizados pelo Amenitiz antes de importar relatórios de reservas."],
  ["This property already has historical imports.", "Esta propriedade já tem importações históricas."],
  ["Changing room names after imports can affect room-type historical analysis. If the Amenitiz room names have not changed, keep the existing names exactly as they are.", "Alterar nomes de quartos depois de existirem importações pode afetar a análise histórica por tipo de quarto. Se os nomes no Amenitiz não mudaram, mantenha-os exatamente como estão."],
  ["Used throughout all dashboards and imports.", "Utilizada em todos os painéis e importações."],
  ["More import adapters can be added later without changing this property setup.", "Poderão ser adicionadas outras fontes de importação sem alterar esta configuração da propriedade."],
  ["The names below must match the room names in Amenitiz exactly.", "Os nomes abaixo têm de corresponder exatamente aos nomes dos quartos no Amenitiz."],
  ["Room quantities match the declared property inventory.", "As quantidades dos quartos correspondem ao inventário declarado da propriedade."],
  ["Use one row per room type. Quantity is the number of sellable rooms of that exact type.", "Utilize uma linha por tipo de quarto. A quantidade corresponde ao número de quartos vendáveis desse tipo exato."],
]);

const fragments: Array<[RegExp, string]> = [
  [/^(\d+) active channels$/i, "$1 canais ativos"],
  [/^Requested$/i, "Solicitado"],
  [/^Observed booking-date coverage$/i, "Cobertura observada das datas de reserva"],
  [/^Missing booking date$/i, "Data de reserva em falta"],
  [/^Cancelled-only filter$/i, "Filtro: apenas canceladas"],
  [/^Current diagnostic detail$/i, "Detalhe de diagnóstico atual"],
  [/^Room type (\d+)$/i, "Tipo de quarto $1"],
  [/^Adjust the room quantities so they total (\d+)\.$/i, "Ajuste as quantidades dos quartos para totalizarem $1."],
  [/^Row (\d+)$/i, "Linha $1"],
  [/^Plus (\d+) more issues\./i, "Mais $1 problemas."],
  [/^Import (\d+) reservations$/i, "Importar $1 reservas"],
  [/^(\d+) reservations imported successfully\.$/i, "$1 reservas importadas com sucesso."],
  [/^Calculating booking pace across (\d+) snapshots…$/i, "A calcular o ritmo de reservas em $1 relatórios…"],
]);

function translate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const direct = phrases.get(trimmed);
  let translated = direct ?? trimmed;
  if (!direct) {
    for (const [pattern, replacement] of fragments) translated = translated.replace(pattern, replacement);
  }
  if (translated === trimmed) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const next = translate(node.nodeValue ?? "");
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  node.childNodes.forEach(translateNode);
}

let installed = false;

export function initPortuguesePhrases() {
  if (installed) return;
  translateNode(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach(translateNode);
  });
  observer.observe(document.body, { subtree: true, childList: true });
  installed = true;
}
