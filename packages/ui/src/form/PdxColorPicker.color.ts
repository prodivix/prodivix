/**
 * Colour parsing and the hex/HSL round trip behind the channel sliders.
 *
 * The stored value is always a six-digit hex string; HSL exists only so the
 * channels can be moved one step at a time from the keyboard.
 */

export interface PdxColorChannels {
  /** 0-100. */
  lightness: number;
  /** 0-360. */
  hue: number;
  /** 0-100. */
  saturation: number;
}

const SHORT_HEX = /^[0-9a-f]{3}$/i;
const LONG_HEX = /^[0-9a-f]{6}$/i;

export const parseHexColor = (value: string) => {
  const candidate = value.trim().replace(/^#/, '');

  if (SHORT_HEX.test(candidate)) {
    return `#${candidate
      .split('')
      .map((character) => `${character}${character}`)
      .join('')}`.toUpperCase();
  }

  if (LONG_HEX.test(candidate)) {
    return `#${candidate.toUpperCase()}`;
  }

  return undefined;
};

/**
 * A six-digit value is complete enough to publish mid-typing. The three-digit
 * form is not: committing `#1A2` would rewrite the field before the user has
 * finished typing `#1A2B3C`.
 */
export const isCompleteHexColor = (value: string) =>
  LONG_HEX.test(value.trim().replace(/^#/, ''));

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const hexToChannels = (hex: string): PdxColorChannels => {
  const normalized = parseHexColor(hex) ?? '#000000';
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { hue: 0, lightness: Math.round(lightness * 100), saturation: 0 };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;

  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  return {
    hue: hue % 360,
    lightness: Math.round(lightness * 100),
    saturation: Math.round(saturation * 100),
  };
};

export const channelsToHex = ({
  hue,
  lightness,
  saturation,
}: PdxColorChannels) => {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const normalizedSaturation = clamp(saturation, 0, 100) / 100;
  const normalizedLightness = clamp(lightness, 0, 100) / 100;

  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const secondary = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const offset = normalizedLightness - chroma / 2;
  const sector = Math.floor(normalizedHue / 60);

  const sectors: Array<[number, number, number]> = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ];
  const [red, green, blue] = sectors[sector] ?? sectors[0];

  const toHex = (channel: number) =>
    Math.round((channel + offset) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`.toUpperCase();
};
