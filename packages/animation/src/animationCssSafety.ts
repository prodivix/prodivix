const CSS_FRAGMENT_ID = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/u;
const CSS_NUMBER = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;
const CSS_TRANSFORM = new RegExp(
  String.raw`^(?:(?:translate[XY]\(${CSS_NUMBER}px\)|scale\(${CSS_NUMBER}\))(?: +|$))+$`,
  'u'
);
const CSS_FILTER = new RegExp(
  String.raw`^(?:(?:blur\(${CSS_NUMBER}px\)|(?:brightness|contrast|grayscale|invert|saturate|sepia)\(${CSS_NUMBER}%\)|hue-rotate\(${CSS_NUMBER}deg\)|url\(#[A-Za-z_][A-Za-z0-9_-]{0,127}\))(?: +|$))+$`,
  'u'
);

export const isSafeAnimationCssFragmentId = (value: string): boolean =>
  CSS_FRAGMENT_ID.test(value);

export const isSafeAnimationCssColor = (value: string): boolean => {
  const normalized = value.trim();
  return (
    normalized === value &&
    normalized.length > 0 &&
    normalized.length <= 256 &&
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    !/[\u0000-\u001f\u007f;{}"'\\!]/u.test(normalized) &&
    !/url\s*\(/iu.test(normalized) &&
    /^[A-Za-z0-9#(),.%+\-/ ]+$/u.test(normalized)
  );
};

export const isSafeAnimationCssTransform = (value: string): boolean =>
  value.length <= 512 && CSS_TRANSFORM.test(value);

export const isSafeAnimationCssFilter = (value: string): boolean =>
  value.length <= 512 && CSS_FILTER.test(value);
