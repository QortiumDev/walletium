import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';

// Initialize i18n for testing
i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['core'],
  defaultNS: 'core',
  resources: {
    en: {
      core: {
        close: 'close',
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

const theme = createTheme();

interface AllTheProvidersProps {
  children: React.ReactNode;
}

const AllTheProviders = ({ children }: AllTheProvidersProps) => {
  return (
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </ThemeProvider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };
