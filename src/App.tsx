import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { PlainShell } from './components/PlainShell';
import { AuthScreen } from './features/auth/AuthScreen';
import { LogScreen } from './features/log/LogScreen';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { QuestFormScreen } from './features/quests/QuestFormScreen';
import { QuestsScreen } from './features/quests/QuestsScreen';
import { ReportScreen } from './features/report/ReportScreen';
import { StatusScreen } from './features/status/StatusScreen';
import { NotFoundScreen } from './features/system/NotFoundScreen';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PlainShell />}>
          <Route path="/auth" element={<AuthScreen />} />
          <Route path="/onboarding" element={<OnboardingScreen />} />
        </Route>

        <Route element={<AppShell />}>
          <Route index element={<StatusScreen />} />
          <Route path="quests" element={<QuestsScreen />} />
          <Route path="quests/new" element={<QuestFormScreen mode="create" />} />
          <Route path="quests/:questId/edit" element={<QuestFormScreen mode="edit" />} />
          <Route path="log" element={<LogScreen />} />
          <Route path="report" element={<ReportScreen />} />
        </Route>

        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
