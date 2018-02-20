import React from 'react';

export default ({ className = '', ...rest }) => {
  return (
    <input
      className={`input-reset ba b--black-20 pa2 mb2 db w-100 ${className}`}
      { ...rest }
    />
  );
};
