let installed = false;

export function initPortugueseNumberFormatting() {
  if (installed) return;

  const NativeNumberFormat = Intl.NumberFormat;
  const LocalizedNumberFormat = function (
    this: Intl.NumberFormat,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions,
  ) {
    const locale = locales === "en-GB" || locales === undefined ? "pt-PT" : locales;
    return new NativeNumberFormat(locale, options);
  } as unknown as Intl.NumberFormatConstructor;

  Object.setPrototypeOf(LocalizedNumberFormat, NativeNumberFormat);
  LocalizedNumberFormat.prototype = NativeNumberFormat.prototype;
  Intl.NumberFormat = LocalizedNumberFormat;
  installed = true;
}
