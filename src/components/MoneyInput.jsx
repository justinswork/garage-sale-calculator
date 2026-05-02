import { forwardRef } from 'react';
import { sanitizeMoneyInput } from '../utils/money.js';

const MoneyInput = forwardRef(function MoneyInput(
  { value, onChange, onBlur, onKeyDown, autoFocus, disabled, placeholder, className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(sanitizeMoneyInput(e.target.value))}
      onFocus={(e) => {
        // select the whole value so typing replaces it
        try { e.target.select(); } catch {}
      }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      {...rest}
    />
  );
});

export default MoneyInput;
