# Crew voices and MSFS 2020
- [x] Revised ground-initiated dialogue, combined clearance/brake call, both-engine start and automatic disconnect; 14 engine tests and full typed radio exchange verified, with matching pushback/training prompts (physical microphone and MSFS untested).
- [x] Two configurable hold-to-talk keys and touch controls; release and focus-loss safety verified with automated tests and browser recognition simulation (physical microphone untested).
- [x] Reliable PTT recording with microphone and speaker selection (speaker choice unsupported in Safari/iPad); recognition verified with a spoken sample, physical microphone untested.
- [x] Natural online crew speech with airport/day selection and visible errors.
- [x] Understand pushback facing compass headings.
- [ ] Native Windows Tauri installer with bundled SimConnect, Whisper, and Piper services is implemented; awaiting Windows build and simulator verification.
- [x] SimBrief latest-flight import with local identifier storage and departure-airport crew context; parsing tests and real-service error handling verified, without inferring pushback direction.
- [ ] Verify successful SimBrief import with the user's latest flight: needs their SimBrief Pilot ID or username and a generated flight plan.