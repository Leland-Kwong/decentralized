import React from 'react';
import { HotKeys } from 'react-hotkeys';

export default ({
  className = '',
  type,
  onRequestSave = () => {},
  value,
  ...rest
}) => {

  const classes = [
    `input-reset ba b--black-20 pa2 mb2 db w-100`,
    'mw-100',
    className
  ].join(' ');

  const Input = type === 'textarea'
    ? <textarea className={classes} value={value} { ...rest } />
    : (
      <input
        className={classes}
        type={type}
        value={value}
        { ...rest }
      />
    );

  const handlers = {
    requestSave: (e) => {
      e.preventDefault();
      onRequestSave(value);
    }
  };
  return (
    <HotKeys handlers={handlers}>
      {Input}
    </HotKeys>
  );
};
