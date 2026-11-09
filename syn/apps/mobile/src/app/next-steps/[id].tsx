import { useLocalSearchParams } from 'expo-router';
import { useI18n } from '../../i18n';
import { getSession } from '../../scan/session';
import { Card, Screen } from '../../ui/Screen';
import { T } from '../../ui/T';
import { VerdictBadge } from '../../ui/VerdictCard';

export default function NextSteps() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const rec = getSession(id);
  if (!rec?.verdict) return <Screen><T>—</T></Screen>;
  const medical = rec.verdict.annotations.includes('medical_professional_only');
  return (
    <Screen>
      <VerdictBadge verdict={rec.verdict.verdict} />
      <Card>
        {t.steps[rec.verdict.verdict].map((s, i) => <T key={i}>{i + 1}. {s}</T>)}
        {medical && <T bold>{t.annotation.medical_professional_only}</T>}
      </Card>
    </Screen>
  );
}
