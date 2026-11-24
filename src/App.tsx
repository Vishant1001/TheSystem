import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { PlainShell } from './components/PlainShell';
import {
  RequireHunter,
  RequireNoHunter,
  RequireNoSession,
  RequirePenaltyResolved,
  RequireReportAcknowledged,
  RequireSession,
} from './components/guards';
import { AuthScreen } from './features/auth/AuthScreen';
import { BossFormScreen } from './features/gym/BossFormScreen';
import { ExerciseHistoryScreen } from './features/gym/ExerciseHistoryScreen';
import { WorkoutLoggerScreen } from './features/gym/WorkoutLoggerScreen';
import { LogScreen } from './features/log/LogScreen';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { PenaltyScreen } from './features/penalty/PenaltyScreen';
import { QuestFormScreen } from './features/quests/QuestFormScreen';
import { QuestsScreen } from './features/quests/QuestsScreen';
import { ReportScreen } from './features/report/ReportScreen';
import { SafeZonesScreen } from './features/settings/SafeZonesScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { StatusScreen } from './features/status/StatusScreen';
import { NotFoundScreen } from './features/system/NotFoundScreen';

/**
 * Route guards (brief 7.2):
 *   no session            -> /auth
 *   session, no hunter    -> /onboarding
 *   session and hunter    -> the app
 * Each guard also redirects away from screens that no longer apply, so the
 * back button cannot strand you on a sign-in form while signed in.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RequireNoSession />}>
          <Route element={<PlainShell />}>
            <Route path="/auth" element={<AuthScreen />} />
          </Route>
        </Route>

        <Route element={<RequireSession />}>
          <Route element={<RequireNoHunter />}>
            <Route element={<PlainShell />}>
              <Route path="/onboarding" element={<OnboardingScreen />} />
            </Route>
          </Route>

          <Route element={<RequireHunter />}>
            <Route element={<AppShell />}>
              {/* The report itself is never gated, or it could not be read. */}
              <Route path="report" element={<ReportScreen />} />

              {/* Report -> Penalty -> everything else (brief 3.5). */}
              <Route element={<RequireReportAcknowledged />}>
                <Route path="penalty" element={<PenaltyScreen />} />

                <Route element={<RequirePenaltyResolved />}>
                  <Route index element={<StatusScreen />} />
                  <Route path="quests" element={<QuestsScreen />} />
                  <Route path="quests/new" element={<QuestFormScreen mode="create" />} />
                  <Route path="quests/:questId/edit" element={<QuestFormScreen mode="edit" />} />
                  <Route path="log" element={<LogScreen />} />
                  <Route path="log/workout" element={<WorkoutLoggerScreen />} />
                  <Route path="exercises/:exerciseId" element={<ExerciseHistoryScreen />} />
                  <Route path="bosses/new" element={<BossFormScreen mode="create" />} />
                  <Route path="bosses/:bossId/edit" element={<BossFormScreen mode="edit" />} />
                  <Route path="settings" element={<SettingsScreen />} />
                  <Route path="settings/safe-zones" element={<SafeZonesScreen />} />
                </Route>
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
