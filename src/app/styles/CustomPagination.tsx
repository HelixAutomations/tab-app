// src/CustomPagination.tsx

import React, { useMemo } from 'react';
import { Stack, Text, IconButton } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';

interface CustomPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const buttonStyle = mergeStyles({
  width: 30,
  height: 30,
  borderRadius: '50%',
  backgroundColor: '#ffffff',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  ':hover': {
    backgroundColor: '#f0f0f0',
  },
});

const activeButtonStyle = mergeStyles({
  backgroundColor: '#D65541',
  color: '#ffffff',
  ':hover': {
    backgroundColor: '#C54439',
  },
});

const CustomPagination: React.FC<CustomPaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  // Generate an array of page numbers
  const pages = useMemo(() => {
    const pageNumbers = [];
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(i);
    }
    return pageNumbers;
  }, [totalPages]);

  return (
    <Stack horizontal horizontalAlign="center" tokens={{ childrenGap: 5 }}>
      {/* Previous Page Button */}
      <IconButton
        iconProps={{ iconName: 'ChevronLeft' }}
        title="Previous Page"
        ariaLabel="Previous Page"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={buttonStyle}
      />

      {/* Page Number Buttons */}
      {pages.map((page) => (
        <IconButton
          key={page}
          text={page.toString()}
          onClick={() => onPageChange(page)}
          className={mergeStyles(buttonStyle, page === currentPage && activeButtonStyle)}
          ariaLabel={`Page ${page}`}
        />
      ))}

      {/* Next Page Button */}
      <IconButton
        iconProps={{ iconName: 'ChevronRight' }}
        title="Next Page"
        ariaLabel="Next Page"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={buttonStyle}
      />
    </Stack>
  );
};

export default CustomPagination;
