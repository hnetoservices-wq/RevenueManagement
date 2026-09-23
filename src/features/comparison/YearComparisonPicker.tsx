import "./yearComparison.css";

export function YearComparisonPicker({ options, selected, onChange }: { options: number[]; selected: number[]; onChange: (years: number[]) => void }) {
  function toggle(year: number) {
    onChange(selected.includes(year)
      ? selected.filter((item) => item !== year)
      : [...selected, year].sort((a, b) => b - a));
  }

  return <details className="year-comparison">
    <summary>{selected.length ? `Comparar: ${selected.join(", ")}` : "Comparar anos"}</summary>
    <div className="year-comparison-menu">
      <span>Pode selecionar vários anos</span>
      {options.length ? options.map((year) => <label className="year-comparison-option" key={year}><input type="checkbox" checked={selected.includes(year)} onChange={() => toggle(year)} />{year}</label>) : <div className="year-comparison-empty">Ainda não existem outros anos com dados para comparar.</div>}
      <button type="button" className="year-comparison-clear" onClick={() => onChange([])}>Sem comparação</button>
    </div>
  </details>;
}
