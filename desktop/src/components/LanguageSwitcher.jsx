import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">{t('settings.language')}:</span>
      <select
        value={i18n.resolvedLanguage}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="text-sm border rounded px-2 py-1"
      >
        <option value="en">{t('settings.en')}</option>
        <option value="fr">{t('settings.fr')}</option>
      </select>
    </div>
  );
}