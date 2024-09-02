import React from 'react';

export const ImagePreview = ({ base64Image }: { base64Image: string }): JSX.Element => {
  return (
    <img
      src={base64Image}
      alt="Preview"
      style={{
        width: '40px',
        height: '40px',
        objectFit: 'cover',
        borderRadius: '4px',
        border: '1px solid var(--jp-border-color1)'
      }}
    />
  );
};
