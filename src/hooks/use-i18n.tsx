import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren
} from 'react'

import {
  type TranslationKey,
  translate,
  type UiLocale,
  uiLocaleOptions
} from '@/shared/i18n'

interface I18nContextValue {
  locale: UiLocale
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  localeOptions: typeof uiLocaleOptions
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  locale,
  children
}: PropsWithChildren<{ locale: UiLocale }>) {
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t: (key, params) => translate(locale, key, params),
      localeOptions: uiLocaleOptions
    }),
    [locale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)

  if (!value) {
    throw new Error('useI18n must be used within an I18nProvider.')
  }

  return value
}
