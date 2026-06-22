# Global Processing And Error Feedback

## Goal

Keep loading, processing, and error feedback visible regardless of the current screen, mobile scroll position, or nested scrolling container.

## User Experience

- Display a thin, indeterminate processing bar fixed to the top of the viewport while the initial public data is loading or any tracked asynchronous user action is running.
- Keep the bar visible until all overlapping tracked operations finish.
- Display application errors in a fixed toast immediately below the processing bar.
- Automatically dismiss an error after five seconds. A newer error replaces the current error and restarts the timer.
- Account for mobile safe areas so feedback remains visible on notched devices.
- Preserve existing disabled-button states and form-specific validation messages.

## Architecture

Add a small application-level activity provider that exposes operations for starting and finishing work and reporting errors. It owns an active-operation count and the current transient error. A single viewport-fixed feedback component consumes this state and renders the processing bar and error toast above every screen mode.

Initial SWR loading and revalidation, authentication, logout, and admin mutations will report activity through this shared interface. Each tracked operation must release its activity entry in a `finally` block so failures cannot leave the processing bar visible indefinitely.

## Accessibility And Motion

- The loading indicator uses `role="progressbar"` with an accessible label and no fabricated percentage.
- The error toast uses `role="alert"` so failures are announced immediately.
- Indeterminate animation is disabled or simplified when the user requests reduced motion.
- The toast maintains readable contrast and does not require interaction before it disappears.

## Error Handling

Existing request errors continue to use their current messages where available. Errors raised by tracked actions are also reported to the global toast. Expected field-level validation remains next to its form rather than being promoted globally.

Public-data fetch failures use the same global error presentation instead of the current page-flow banner. Authentication session-expiry messaging remains on the sign-in form because it explains why the user was redirected.

## Testing

- Verify the bar appears when tracked work starts and disappears when it finishes.
- Verify overlapping operations keep the bar visible until the last operation finishes.
- Verify errors render globally, replace older errors, and dismiss after five seconds.
- Verify failed operations release their activity entries.
- Run the existing component and unit test suites and a production build.
