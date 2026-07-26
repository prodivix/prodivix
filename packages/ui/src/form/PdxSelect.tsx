import './PdxSelect.scss';
import { ChevronDown, Search } from 'lucide-react';
import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  mergeClassNames,
  type PdxControlSize,
  type PdxDataAttributeProps,
  type PdxValidationState,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import PdxField, { usePdxFieldIds } from './PdxField';
import PdxPickerListbox, {
  edgeSelectableIndex,
  moveSelectableIndex,
  pickerOptionElementId,
  type PdxPickerOption,
} from './PdxPickerListbox';
import PdxPickerPopover, { PdxPickerPopoverToggle } from './PdxPickerPopover';

export type PdxSelectOption = PdxPickerOption;

export interface PdxSelectOwnProps extends PdxDataAttributeProps {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
  'aria-label'?: string;
  className?: string;
  contentClassName?: string;
  controlClassName?: string;
  defaultValue?: string;
  description?: ReactNode;
  disabled?: boolean;
  /** Shown in the panel when typing filters every option away. */
  emptyLabel?: string;
  /** Shown in the panel before the user types, so typeahead is discoverable. */
  filterHint?: string;
  id?: string;
  label?: ReactNode;
  message?: ReactNode;
  name?: string;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onValueChange?: (value: string, option?: PdxSelectOption) => void;
  options: PdxSelectOption[];
  placeholder?: string;
  required?: boolean;
  size?: PdxControlSize;
  state?: PdxValidationState;
  style?: React.CSSProperties;
  title?: string;
  value?: string;
}

export type PdxSelectProps = PdxSelectOwnProps;

const isTypeaheadKey = (event: KeyboardEvent<HTMLButtonElement>) =>
  event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;

/**
 * A select-only combobox with typeahead.
 *
 * Focus never leaves the trigger: arrows, Home/End and printable characters are
 * handled there and the list reports its position through
 * `aria-activedescendant`. That is what lets typing filter the options while the
 * same key handling still selects, and it keeps one tab stop for the control.
 */
const PdxSelect = forwardRef<HTMLButtonElement, PdxSelectProps>(
  function PdxSelect(
    {
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      'aria-label': ariaLabel,
      className,
      contentClassName,
      controlClassName,
      dataAttributes,
      defaultValue = '',
      description,
      disabled = false,
      emptyLabel = 'No matching options',
      filterHint = 'Type to filter',
      id,
      label,
      message,
      name,
      onBlur,
      onFocus,
      onValueChange,
      options,
      placeholder = 'Select item',
      required = false,
      size = 'Medium',
      state = 'Default',
      style,
      title,
      value,
    },
    ref
  ) {
    const [currentValue, setCurrentValue] = useControllableState({
      value,
      defaultValue,
    });
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeValue, setActiveValue] = useState<string | undefined>(
      undefined
    );
    const fieldIds = usePdxFieldIds({
      id,
      description,
      message,
      describedBy: ariaDescribedBy,
    });
    const listboxId = `${useId().replaceAll(':', '')}-listbox`;

    const visibleOptions = useMemo(() => {
      const needle = query.trim().toLowerCase();
      if (!needle) return options;

      return options.filter((option) =>
        option.label.toLowerCase().includes(needle)
      );
    }, [options, query]);

    const activeIndex = useMemo(() => {
      const index = visibleOptions.findIndex(
        (option) => option.value === activeValue
      );

      return index >= 0 && !visibleOptions[index]?.disabled
        ? index
        : edgeSelectableIndex(visibleOptions, 'first');
    }, [activeValue, visibleOptions]);

    const selectedOption = options.find(
      (option) => option.value === currentValue
    );
    const panelLabel =
      (typeof label === 'string' ? label : undefined) ?? ariaLabel ?? 'Options';

    const openPanel = () => {
      setQuery('');
      setActiveValue(currentValue || undefined);
      setOpen(true);
    };

    const closePanel = () => {
      setQuery('');
      setActiveValue(undefined);
      setOpen(false);
    };

    const selectOption = (option: PdxSelectOption) => {
      setCurrentValue(option.value);
      onValueChange?.(option.value, option);
      closePanel();
    };

    const commitActiveOption = () => {
      const option = visibleOptions[activeIndex];
      if (!option || option.disabled) return;
      selectOption(option);
    };

    const moveActive = (step: 1 | -1) => {
      const next = moveSelectableIndex(visibleOptions, activeIndex, step);
      setActiveValue(visibleOptions[next]?.value);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      switch (event.key) {
        case 'Escape':
          if (!open) return;
          event.preventDefault();
          closePanel();
          return;
        case 'Tab':
          if (open) closePanel();
          return;
        case 'ArrowDown':
        case 'ArrowUp':
          event.preventDefault();
          if (!open) {
            openPanel();
            return;
          }
          moveActive(event.key === 'ArrowDown' ? 1 : -1);
          return;
        case 'Home':
        case 'End':
          if (!open) return;
          event.preventDefault();
          setActiveValue(
            visibleOptions[
              edgeSelectableIndex(
                visibleOptions,
                event.key === 'Home' ? 'first' : 'last'
              )
            ]?.value
          );
          return;
        case 'Enter':
          // Closed, the button's own activation opens the panel.
          if (!open) return;
          event.preventDefault();
          commitActiveOption();
          return;
        case ' ':
          if (!open) return;
          event.preventDefault();
          if (query) {
            setQuery((current) => `${current} `);
            return;
          }
          commitActiveOption();
          return;
        case 'Backspace':
          if (!open || !query) return;
          event.preventDefault();
          setQuery((current) => current.slice(0, -1));
          return;
        default:
          break;
      }

      if (!isTypeaheadKey(event)) return;

      event.preventDefault();
      if (!open) {
        setActiveValue(currentValue || undefined);
        setOpen(true);
      }
      setQuery((current) => current + event.key);
    };

    const statusText =
      visibleOptions.length === 0
        ? emptyLabel
        : `${String(visibleOptions.length)} of ${String(options.length)} options`;

    const control = (
      <PdxPickerPopoverToggle asChild>
        <button
          ref={ref}
          id={fieldIds.controlId}
          className={mergeClassNames('PdxSelectControl', controlClassName)}
          aria-activedescendant={
            open && activeIndex >= 0
              ? pickerOptionElementId(listboxId, activeIndex)
              : undefined
          }
          aria-controls={open ? listboxId : undefined}
          aria-describedby={fieldIds.describedBy}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={ariaInvalid ?? (state === 'Error' || undefined)}
          aria-label={ariaLabel}
          aria-required={required || undefined}
          disabled={disabled}
          onBlur={onBlur}
          onFocus={onFocus}
          onKeyDown={handleKeyDown}
          role="combobox"
          title={title}
          type="button"
        >
          <span
            className="PdxSelectValue"
            data-placeholder={selectedOption ? undefined : 'true'}
          >
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="PdxSelectIndicator"
            size={14}
          />
        </button>
      </PdxPickerPopoverToggle>
    );

    return (
      <PdxField
        className={mergeClassNames('PdxSelect', size, state, className)}
        controlId={fieldIds.controlId}
        dataAttributes={dataAttributes}
        description={description}
        descriptionId={fieldIds.descriptionId}
        label={label}
        message={message}
        messageId={fieldIds.messageId}
        required={required}
        state={state}
        style={style}
      >
        <PdxPickerPopover
          className={mergeClassNames('PdxSelectPanel', contentClassName)}
          control={control}
          label={panelLabel}
          onOpenChange={(nextOpen) => {
            if (nextOpen) openPanel();
            else closePanel();
          }}
          onPanelOpenAutoFocus={(event) => event.preventDefault()}
          open={open && !disabled}
        >
          <p className="PdxPickerPanelHint">
            <Search aria-hidden="true" size={12} />
            <span className="PdxSelectQuery">{query || filterHint}</span>
          </p>
          <PdxPickerListbox
            activeIndex={activeIndex}
            emptyLabel={emptyLabel}
            id={listboxId}
            label={panelLabel}
            onSelect={selectOption}
            options={visibleOptions}
            selectedValue={currentValue || undefined}
          />
          <span className="PdxPickerPanelStatus" role="status">
            {statusText}
          </span>
        </PdxPickerPopover>
        {name ? <input name={name} type="hidden" value={currentValue} /> : null}
      </PdxField>
    );
  }
);

export default PdxSelect;
