import { meetingIdFromPath, useRoute } from "./lib/router";
import { Landing } from "./components/Landing";
import { MeetingView } from "./components/MeetingView";

export default function App() {
  const path = useRoute();
  const meetingId = meetingIdFromPath(path);

  if (!meetingId) return <Landing />;

  // key forces a full remount on navigating between meetings, so no state
  // (transcript, capture refs, etc.) leaks from one meeting into another.
  return <MeetingView key={meetingId} meetingId={meetingId} />;
}
