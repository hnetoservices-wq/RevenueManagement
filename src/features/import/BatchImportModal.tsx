import type { ImportPreview, IsoDate } from "../../domain/models";
import "./batch-import.css";

interface BatchImportModalProps {
  previews: ImportPreview[];
  propertyName: string;
  busy: boolean;
  onChange: (index: number, preview: ImportPreview) => void;
  onRemove: (index: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BatchImportModal({ previews, propertyName, busy, onChange, onRemove, onCancel, onConfirm }: BatchImportModalProps) {
  const totalRows = previews.reduce((sum, preview) => sum + preview.rowCount, 0);
  const totalValid = previews.reduce((sum, preview) => sum + preview.validRowCount, 0);
  const totalWarnings = previews.reduce((sum, preview) => sum + preview.warningCount, 0);
  const totalExcluded = previews.reduce((sum, preview) => sum + preview.excludedRowCount, 0);
  const canImport = previews.length > 0 && previews.every((preview) => preview.validRowCount > 0 && Boolean(preview.dataAsOf));

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onCancel()}>
      <section className="modal batch-import-modal">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Amenitiz import</p>
            <h2>Review {previews.length} reports</h2>
            <p>Each report will be stored as an independent historical snapshot.</p>
          </div>
          <button className="close-button" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className="import-destination"><span>Importing into</span><strong>{propertyName}</strong></div>

        <div className="batch-import-summary">
          <div><strong>{previews.length}</strong><span>Reports</span></div>
          <div><strong>{totalRows}</strong><span>Processed</span></div>
          <div className="valid"><strong>{totalValid}</strong><span>Valid</span></div>
          <div className="warning"><strong>{totalWarnings}</strong><span>Warnings</span></div>
          <div className="invalid"><strong>{totalExcluded}</strong><span>Excluded</span></div>
        </div>

        <div className="batch-import-list">
          {previews.map((preview, index) => (
            <article className="batch-import-row" key={`${preview.fileHash}-${index}`}>
              <div className="batch-import-file">
                <strong title={preview.filename}>{preview.filename}</strong>
                <small>{preview.validRowCount} valid · {preview.warningCount} warnings · {preview.excludedRowCount} excluded</small>
              </div>
              <label className="batch-import-date">
                <span>Data as of</span>
                <input
                  type="date"
                  value={preview.dataAsOf}
                  onChange={(event) => onChange(index, { ...preview, dataAsOf: event.target.value as IsoDate })}
                />
              </label>
              <button className="batch-import-remove" type="button" onClick={() => onRemove(index)} aria-label={`Remove ${preview.filename}`}>×</button>
            </article>
          ))}
        </div>

        <p className="privacy-line">Only analytics fields will be stored. Guest names, email addresses, phone numbers, addresses, requests, and comments are discarded.</p>
        <footer>
          <button className="secondary-button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" disabled={busy || !canImport} onClick={onConfirm}>
            {busy ? "Saving…" : `Import ${previews.length} reports`}
          </button>
        </footer>
      </section>
    </div>
  );
}
