# TADS Flood — three-minute video with speaker notes

## Before recording

1. Open the production preview: http://127.0.0.1:4175/ . Keep the API running.
2. Prepare the real case in the assessment form:
   - West: 85.3232
   - South: 28.149117
   - East: 85.348268
   - North: 28.188188
   - Flood date: 2026-08-26
   - Mode: Live (Sentinel + pre-event OSM)
   Run once before recording. Confirm the actual displayed result. The notes
   describe the recorded case: 41.8% coverage, 11 candidate-exposed assets,
   0 potentially isolated, 2 unknown access. If your displayed run differs,
   narrate its actual values; do not read mismatched numbers over it.
3. In Report, ask once to warm the local model:
   "Which mapped settlements may be isolated, and what is uncertain?"
   Confirm the answer, then return to Assessment for the opening scene.
4. Open the technical report PDF to page 5 and the GitHub implementation branch
   in separate tabs. Keep credentials, terminals and personal notifications out
   of the capture. GitHub: https://github.com/prakharsinghpersonal/tads-flood/tree/PKS/data-engine
5. For offline testing, open Chrome DevTools > Network > throttling dropdown >
   Offline. Rehearse saving the package and reloading first. Localhost can stay
   reachable when Wi-Fi is switched off, so use browser network emulation.
   Return the dropdown to No throttling when finished.
6. Record your app window with Shift-Command-5. Choose your microphone under
   Options, start recording, and read the notes below at roughly 120 words/min.
   Use a phone or second window outside the captured area for the notes.

Use actual running UI. Saved real-case output is a recorded assessment, not a
fresh observation. If using synthetic input, clearly label the entire scene
SYNTHETIC and replace the real-case narration. Keep the Nepali DRAFT label.

## 0:00–0:15

**Screen:** Show the loaded real Syapru Besi assessment; keep LIVE and the event date visible.

**Say:**

> This is TADS Flood, an evidence-first flood assessment workspace. It connects satellite change to mapped infrastructure, uncertain road access, and cited situation briefs that users can inspect and save offline.

## 0:15–0:40

**Screen:** Click Before, then After on the Radar control. Point to acquisition dates and valid coverage.

**Say:**

> This case covers Syapru Besi for August twenty-sixth, twenty-twenty-six. These are actual Sentinel-one radar scenes acquired before and after the event. The pipeline checks their product identity, orbit and dates, and combines them with terrain data and pre-event OpenStreetMap. Only forty-one point eight percent has valid comparison coverage.

## 0:40–1:00

**Screen:** Show summary counts. Select an unknown-access settlement and open its evidence.

**Say:**

> The assessment flags eleven candidate-exposed assets. It predicts zero potentially isolated settlements, while two have unknown access. Zero predicted isolation does not mean the roads are safe. These are candidate findings, and selecting a settlement opens its supporting evidence.

## 1:00–1:30

**Screen:** Open Report and the English brief. Scroll to copilot; ask the exact prepared question and show its answer/citations.

**Say:**

> The situation brief carries the assessment's quantities and citations. The deterministic brief is labelled separately from the AI copilot. Here, I ask which settlements may be isolated and what is uncertain. The local model selects approved facts; code supplies the numbers and evidence links. The model is warmed before this recording, and response time can vary.

## 1:30–1:50

**Screen:** Switch the brief to Nepali, choose Nepali in Answer language, and ask the same copilot question. Point to DRAFT. If time permits, ask: How many casualties were caused by this flood?

**Say:**

> I switch to Nepali. The brief and copilot preserve the assessment's numerical facts and citations. The draft badge stays visible because fluent review is still pending. Unsupported casualty questions are refused.

## 1:50–2:15

**Screen:** Open Offline & mission, save the package, disable network using Chrome DevTools, reload, then inspect cached imagery. Keep mission collapsed.

**Say:**

> Now I save a verified offline package. It contains the exact assessment snapshot, radar images and backend-generated documents. With the browser offline, I reload and inspect the cached result. The original dates and mode remain visible. Cached viewing does not imply new observations, and the drone extension is a separate simulation.

## 2:15–2:45

**Screen:** Show page 5 of the technical report: reference metrics and Timure run. Use the PDF, not a fabricated app panel.

**Say:**

> We compared the candidate flood and disturbance proxy with the official EMSR927 landslide reference. The overlap was poor: IoU zero point zero zero five seven and F-one zero point zero one one four. The baseline misses most reference damage. A separate Timure area and date also ran, but we have not claimed independently measured holdout accuracy.

## 2:45–3:00

**Screen:** Show the GitHub implementation branch and README. Stop at three minutes.

**Say:**

> The contribution is a working, source-linked assessment workflow with explicit uncertainty and offline inspection. The repository contains setup instructions and measured results. Detection quality and language review remain our next priorities.

## Upload

Stop at 3:00. If necessary trim only setup/tail; caption any shortened model wait
rather than implying an unmeasured response speed. Upload to YouTube as Unlisted
and paste the video URL into Devpost. English narration supplies the explanation;
the generated SRT file can also be uploaded as English captions. Check the video
link opens without signing in before final submission.

The narration/SRT are preparation material; no video is generated by these files.
