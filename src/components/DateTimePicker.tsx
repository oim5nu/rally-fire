import React, { useId, useState } from 'react';

interface DateTimePickerProps {
  name: string;
  label: string;
  required?: boolean;
}

export default function DateTimePicker({
  name,
  label,
  required = false,
}: DateTimePickerProps) {
  const id = useId();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const value = date && time ? `${date}T${time}` : '';

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <label htmlFor={`${id}-date`} className="min-w-0">
          <span className="sr-only">Date</span>
          <input
            id={`${id}-date`}
            type="date"
            required={required}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-3 text-sm text-white outline-none transition focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30"
            style={{ colorScheme: 'dark' }}
          />
        </label>
        <label htmlFor={`${id}-time`} className="min-w-0">
          <span className="sr-only">Time</span>
          <input
            id={`${id}-time`}
            type="time"
            required={required}
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-3 text-sm text-white outline-none transition focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30"
            style={{ colorScheme: 'dark' }}
          />
        </label>
      </div>
      <input type="hidden" name={name} value={value} />
    </fieldset>
  );
}
