import React from 'react';

export default ({ className = '', type, ...rest }) => {
  const classes = [
    `input-reset ba b--black-20 pa2 mb2 db w-100`,
    'mw-100',
    className
  ].join(' ');
  if (type === 'textarea') {
    return <textarea className={classes} { ...rest } />;
  }
  return (
    <input
      className={classes}
      type={type}
      { ...rest }
    />
  );
};
