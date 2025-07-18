// https://fluentsite.z22.web.core.windows.net/quick-start
// invisible change 2
import {
  FluentProvider,
  teamsLightTheme,
  teamsDarkTheme,
  teamsHighContrastTheme,
  Spinner,
  tokens,
} from "@fluentui/react-components";
import { HashRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { useTeamsUserCredential } from "@microsoft/teamsfx-react";
import { lazy, Suspense } from "react";
const Privacy = lazy(() => import("./Privacy"));
const TermsOfUse = lazy(() => import("./TermsOfUse"));
const Tab = lazy(() => import("./Tab"));
import { TeamsFxContext } from "./Context";
import config from "./sample/lib/config";

/**
 * The main app which handles the initialization and routing
 * of the app.
 */
export default function App() {
  const { loading, theme, themeString, teamsUserCredential } = useTeamsUserCredential({
    initiateLoginEndpoint: config.initiateLoginEndpoint!,
    clientId: config.clientId!,
  });
  return (
    <TeamsFxContext.Provider value={{ theme, themeString, teamsUserCredential }}>
      <FluentProvider
        theme={
          themeString === "dark"
            ? teamsDarkTheme
            : themeString === "contrast"
            ? teamsHighContrastTheme
            : {
                ...teamsLightTheme,
                colorNeutralBackground3: "#eeeeee",
              }
        }
        style={{ background: tokens.colorNeutralBackground3 }}
      >
        <Router>
          {loading ? (
            <Spinner style={{ margin: 100 }} />
          ) : (
              <Suspense fallback={<Spinner style={{ margin: 100 }} />}>
                <Routes>
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/termsofuse" element={<TermsOfUse />} />
                  <Route path="/tab" element={<Tab />} />
                  <Route path="*" element={<Navigate to={"/tab"} />}></Route>
                </Routes>
              </Suspense>
          )}
        </Router>
      </FluentProvider>
    </TeamsFxContext.Provider>
  );
}
