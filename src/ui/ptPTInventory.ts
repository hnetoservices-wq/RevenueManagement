const exact = new Map<string, string>([
  ["No inventory closures", "Sem indisponibilidades de inventário"],
  ["Exact room-night utilisation using each room type's sellable inventory after closures.", "Utilização exata das noites-quarto com base no inventário vendável de cada tipo de quarto, após indisponibilidades."],
  ["On-the-books occupancy using sellable inventory for each covered stay date. A dot marks dates with unavailable rooms.", "Ocupação em carteira com base no inventário vendável em cada data de estadia coberta. Um ponto assinala as datas com quartos indisponíveis."],
  ["The closure belongs to a different property.", "A indisponibilidade pertence a outra propriedade."],
  ["Select a valid room type.", "Selecione um tipo de quarto válido."],
  ["Enter a valid start and end date.", "Introduza datas de início e fim válidas."],
  ["The end date cannot be before the start date.", "A data de fim não pode ser anterior à data de início."],
  ["Unavailable quantity must be a positive whole number.", "A quantidade indisponível deve ser um número inteiro positivo."],
  ["Inventory closure identifiers are required", "Faltam identificadores da indisponibilidade de inventário."],
  ["Unavailable quantity must be positive", "A quantidade indisponível deve ser positiva."],
  ["Invalid inventory closure date range", "O intervalo de datas da indisponibilidade é inválido."],
  ["Selected room type does not belong to this property", "O tipo de quarto selecionado não pertence a esta propriedade."],
  ["Unavailable quantity exceeds configured room inventory", "A quantidade indisponível excede o inventário configurado deste tipo de quarto."],
  ["Inventory closure belongs to a different property", "A indisponibilidade de inventário pertence a outra propriedade."],
  ["Overlapping closures exceed configured room inventory", "As indisponibilidades sobrepostas excedem o inventário configurado deste tipo de quarto."],
  ["Inventory closure could not be saved", "Não foi possível guardar a indisponibilidade de inventário."],
]);

const replacements: Array<[RegExp, string]> = [
  [/^(\d+) room nights unavailable$/i, "$1 noites-quarto indisponíveis"],
  [/^You cannot close more than (\d+) rooms? of this type\.$/i, "Não pode marcar mais de $1 quartos deste tipo como indisponíveis."],
  [/^Too many (.+) rooms would be unavailable on (\d{4}-\d{2}-\d{2})\.$/i, "Existiriam demasiados quartos $1 indisponíveis em $2."],
];

function translate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const direct = exact.get(trimmed);
  let translated = direct ?? trimmed;
  if (!direct) {
    for (const [pattern, replacement] of replacements) translated = translated.replace(pattern, replacement);
    translated = translated.replaceAll("indisponívelis", "indisponíveis");
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
  for (const attribute of ["title", "aria-label", "placeholder"]) {
    const value = node.getAttribute(attribute);
    if (!value) continue;
    const next = translate(value);
    if (next !== value) node.setAttribute(attribute, next);
  }
  node.childNodes.forEach(translateNode);
}

let installed = false;

export function initPortugueseInventoryUi() {
  if (installed) return;
  translateNode(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(translateNode);
      if (mutation.type === "attributes") translateNode(mutation.target);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "placeholder"],
  });
  installed = true;
}
