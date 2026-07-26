import './PdxColorPicker.scss';
import { Pipette } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type React from 'react';
import { type PdxComponent } from '@prodivix/shared';
import {
  mergeClassNames,
  type PdxValidationState,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import {
  channelsToHex,
  hexToChannels,
  isCompleteHexColor,
  parseHexColor,
  type PdxColorChannels,
} from './PdxColorPicker.color';
import PdxField, { usePdxFieldIds } from './PdxField';
import PdxPickerPopover, { PdxPickerPopoverToggle } from './PdxPickerPopover';

interface PdxColorPickerSpecificProps {
  defaultValue?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  label?: React.ReactNode;
  message?: React.ReactNode;
  onChange?: (value: string) => void;
  required?: boolean;
  showTextInput?: boolean;
  size?: 'Small' | 'Medium' | 'Large';
  state?: PdxValidationState;
  value?: string;
}

export interface PdxColorPickerProps
  extends PdxComponent, PdxColorPickerSpecificProps {}

const DEFAULT_COLOR = '#3F3F3F';

interface ChannelDefinition {
  key: keyof PdxColorChannels;
  label: string;
  max: number;
  unit: string;
}

const CHANNELS: ChannelDefinition[] = [
  { key: 'hue', label: 'Hue', max: 360, unit: 'degrees' },
  { key: 'saturation', label: 'Saturation', max: 100, unit: 'percent' },
  { key: 'lightness', label: 'Lightness', max: 100, unit: 'percent' },
];

/**
 * A colour field whose channels are adjustable from the keyboard.
 *
 * The panel exposes hue, saturation and lightness as range inputs, so every
 * colour in the space is reachable with the arrow keys, Home/End and
 * PageUp/PageDown. The channels are held separately from the hex value because
 * a grey has no meaningful hue to round-trip through.
 */
function PdxColorPicker({
  className,
  dataAttributes = {},
  defaultValue = '#3f3f3f',
  description,
  disabled = false,
  id,
  label,
  message,
  onChange,
  required = false,
  showTextInput = true,
  size = 'Medium',
  state = 'Default',
  style,
  value,
}: PdxColorPickerProps) {
  const normalizedDefault = parseHexColor(defaultValue) ?? DEFAULT_COLOR;
  const [currentValue, setCurrentValue] = useControllableState({
    value,
    defaultValue: normalizedDefault,
    onChange,
  });
  const resolvedValue = parseHexColor(currentValue) ?? normalizedDefault;
  const [draftValue, setDraftValue] = useState(resolvedValue);
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<PdxColorChannels>(() =>
    hexToChannels(resolvedValue)
  );
  const publishedValue = useRef(resolvedValue);
  const fieldIds = usePdxFieldIds({ id, description, message });
  const panelId = useId().replaceAll(':', '');

  useEffect(() => {
    setDraftValue(resolvedValue);
  }, [resolvedValue]);

  // Channels only resync when the colour changed somewhere other than a slider,
  // otherwise rounding through hex would drag the handles as the user moves them.
  useEffect(() => {
    if (publishedValue.current === resolvedValue) return;
    publishedValue.current = resolvedValue;
    setChannels(hexToChannels(resolvedValue));
  }, [resolvedValue]);

  const commitValue = (nextValue: string) => {
    const normalized = parseHexColor(nextValue);
    if (!normalized) return false;

    publishedValue.current = normalized;
    setDraftValue(normalized);
    setCurrentValue(normalized);
    return true;
  };

  const setChannel = (key: keyof PdxColorChannels, next: number) => {
    const nextChannels = { ...channels, [key]: next };
    setChannels(nextChannels);
    commitValue(channelsToHex(nextChannels));
  };

  const handleTextKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setDraftValue(resolvedValue);
      event.currentTarget.blur();
    }
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const toggleId = showTextInput ? `${panelId}-toggle` : fieldIds.controlId;
  const panelLabel =
    typeof label === 'string' ? `${label} channels` : 'Colour channels';

  const control = (
    <div
      className="PdxPickerControl PdxColorPickerControl"
      data-disabled={disabled ? 'true' : undefined}
    >
      <span
        aria-hidden="true"
        className="PdxColorPickerSwatch"
        style={{ '--pdx-color-value': resolvedValue } as React.CSSProperties}
      />
      {showTextInput ? (
        <input
          aria-describedby={fieldIds.describedBy}
          aria-invalid={state === 'Error' || undefined}
          className="PdxPickerControlInput PdxColorPickerText"
          disabled={disabled}
          id={fieldIds.controlId}
          maxLength={7}
          onBlur={() => {
            if (!commitValue(draftValue)) setDraftValue(resolvedValue);
          }}
          onChange={(event) => {
            const nextValue = event.target.value.toUpperCase();
            setDraftValue(nextValue);
            if (isCompleteHexColor(nextValue)) commitValue(nextValue);
          }}
          onKeyDown={handleTextKeyDown}
          required={required}
          spellCheck={false}
          type="text"
          value={draftValue}
        />
      ) : (
        <span className="PdxColorPickerReadout">{resolvedValue}</span>
      )}
      <PdxPickerPopoverToggle asChild>
        <button
          aria-describedby={showTextInput ? undefined : fieldIds.describedBy}
          aria-label={`Adjust colour channels, ${resolvedValue} selected`}
          className="PdxPickerToggle"
          disabled={disabled}
          id={toggleId}
          type="button"
        >
          <Pipette aria-hidden="true" size={15} />
        </button>
      </PdxPickerPopoverToggle>
    </div>
  );

  return (
    <PdxField
      className={mergeClassNames('PdxColorPicker', size, state, className)}
      controlId={showTextInput ? fieldIds.controlId : toggleId}
      dataAttributes={dataAttributes}
      description={description}
      descriptionId={fieldIds.descriptionId}
      label={label}
      message={message}
      messageId={fieldIds.messageId}
      required={required}
      state={state}
      style={style as React.CSSProperties}
    >
      <PdxPickerPopover
        className="PdxColorPickerPanel"
        control={control}
        label={panelLabel}
        onOpenChange={setOpen}
        open={open && !disabled}
      >
        <div className="PdxColorPickerPreview">
          <span
            aria-hidden="true"
            className="PdxColorPickerSwatch"
            style={
              { '--pdx-color-value': resolvedValue } as React.CSSProperties
            }
          />
          <output className="PdxColorPickerPreviewValue">
            {resolvedValue}
          </output>
        </div>
        {CHANNELS.map((channel) => {
          const channelValue = channels[channel.key];
          const nameId = `${panelId}-${channel.key}`;

          return (
            <div className="PdxColorPickerChannel" key={channel.key}>
              <span className="PdxColorPickerChannelName" id={nameId}>
                {channel.label}
              </span>
              <input
                aria-labelledby={nameId}
                aria-valuetext={`${String(channelValue)} ${channel.unit}`}
                className="PdxColorPickerSlider"
                max={channel.max}
                min={0}
                onChange={(event) => {
                  setChannel(channel.key, Number(event.target.value));
                }}
                step={1}
                type="range"
                value={channelValue}
              />
              <span className="PdxColorPickerChannelValue">{channelValue}</span>
            </div>
          );
        })}
      </PdxPickerPopover>
    </PdxField>
  );
}

export default PdxColorPicker;
