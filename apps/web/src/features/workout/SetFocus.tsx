import { Bell, BellOff, Check, Minus, Play, Plus, Square, TimerReset } from "lucide-react";
import { clock } from "./clock";
import "./SetFocus.css";


export interface FocusNumber {
  /** Shown value; a string is a target range that has not been typed yet. */
  value: number | string;
  unit: string;
  label: string;
  step?: number;
  onStep?: (delta: number) => void;
}

export interface FocusSet {
  exerciseName: string;
  exercisePosition: string;
  setNumber: number;
  setCount: number;
  doneCount: number;
  targetLabel?: string;
  previousLabel?: string;
  /** Engine advice for this set: load × reps, expected reps left and why. */
  adviceLabel?: string;
  load?: FocusNumber;
  effort: FocusNumber;
}

export type FocusState =
  | { phase: "ready"; set: FocusSet }
  | { phase: "running"; set: FocusSet; elapsed: number; canEnd: boolean }
  | { phase: "rest"; remaining: number; total: number; overtime: number; done?: FocusSet & { workSeconds?: number; rir: FocusNumber }; next?: FocusSet }
  | { phase: "finished" };

interface Props {
  locale: "vi" | "en";
  state: FocusState;
  alertMuted: boolean;
  wakeLockSupported: boolean;
  lockScreenTimerEnabled: boolean;
  onStart: () => void;
  onEnd: () => void;
  onCancelSet: () => void;
  onFinish: () => void;
  onRest: (seconds?: number) => void;
  onRestartRest: () => void;
  onToggleAlert: () => void;
}

function Stepper({ number, locale }: { number: FocusNumber; locale: "vi" | "en" }) {
  if (!number.onStep || !number.step) return null;
  const step = number.step;
  const amount = `${step} ${number.unit}`;
  return (
    <div className="focus-stepper">
      <button type="button" aria-label={locale === "vi" ? `Giảm ${amount}` : `Decrease by ${amount}`} onClick={() => number.onStep?.(-step)}>−{step}</button>
      <button type="button" aria-label={locale === "vi" ? `Tăng ${amount}` : `Increase by ${amount}`} onClick={() => number.onStep?.(step)}>+{step}</button>
    </div>
  );
}

function Numbers({ set, locale, small }: { set: FocusSet; locale: "vi" | "en"; small?: boolean }) {
  return (
    <div className={small ? "focus-numbers focus-numbers--small" : "focus-numbers"}>
      {set.load ? (
        <>
          <div className="focus-number"><b>{set.load.value}</b><small>{set.load.label}</small><Stepper number={set.load} locale={locale} /></div>
          <span className="focus-numbers__times" aria-hidden="true">×</span>
        </>
      ) : null}
      <div className="focus-number"><b>{set.effort.value}</b><small>{set.effort.label}</small><Stepper number={set.effort} locale={locale} /></div>
    </div>
  );
}

function Heading({ set }: { set: FocusSet }) {
  return (
    <header className="focus-heading">
      <small>{set.exercisePosition}</small>
      <h2>{set.exerciseName}</h2>
      <div className="focus-segments" aria-hidden="true">
        {Array.from({ length: set.setCount }, (_, index) => (
          <i key={index} className={index < set.doneCount ? "is-done" : index === set.setNumber - 1 ? "is-current" : undefined} />
        ))}
      </div>
    </header>
  );
}

export function SetFocus({ locale, state, alertMuted, wakeLockSupported, lockScreenTimerEnabled, onStart, onEnd, onCancelSet, onFinish, onRest, onRestartRest, onToggleAlert }: Props) {
  const vi = locale === "vi";
  const restDone = state.phase === "rest" && state.remaining === 0;
  const headingSet = state.phase === "rest" ? (state.done ?? state.next) : state.phase === "finished" ? undefined : state.set;

  let action: { label: string; detail?: string; onClick: () => void; tone: "start" | "end" | "ghost"; icon: "play" | "stop" | "check"; disabled?: boolean };
  if (state.phase === "running") {
    action = { label: vi ? "Kết thúc set" : "End set", onClick: onEnd, tone: "end", icon: "stop", disabled: !state.canEnd };
  } else if (state.phase === "ready") {
    action = { label: vi ? `Bắt đầu set ${state.set.setNumber}` : `Start set ${state.set.setNumber}`, onClick: onStart, tone: "start", icon: "play" };
  } else if (state.phase === "rest" && state.next) {
    action = {
      label: vi ? `Bắt đầu set ${state.next.setNumber}` : `Start set ${state.next.setNumber}`,
      detail: state.next.exerciseName === state.done?.exerciseName ? undefined : state.next.exerciseName,
      onClick: onStart,
      tone: restDone ? "start" : "ghost",
      icon: "play"
    };
  } else {
    action = { label: vi ? "Kết thúc buổi tập" : "Finish workout", onClick: onFinish, tone: "start", icon: "check" };
  }

  const ringLength = 2 * Math.PI * 88;
  const dockReadout = state.phase === "running"
    ? { label: vi ? "Đang tập" : "Set time", value: clock(state.elapsed), tone: "run" }
    : state.phase === "rest"
      ? (restDone
        ? { label: vi ? "Hết giờ nghỉ" : "Rest over", value: `+${clock(state.overtime)}`, tone: "over" }
        : { label: vi ? "Nghỉ" : "Rest", value: clock(state.remaining), tone: "rest" })
      : undefined;

  return (
    <>
      <section className={`set-focus set-focus--${state.phase}${restDone ? " set-focus--rest-done" : ""}`} aria-label={vi ? "Set hiện tại" : "Current set"}>
        {headingSet ? <Heading set={headingSet} /> : null}

        {state.phase === "ready" ? (
          <>
            <p className="focus-eyebrow">{vi ? `Set ${state.set.setNumber}` : `Set ${state.set.setNumber}`}{state.set.targetLabel ? ` · ${vi ? "mục tiêu" : "target"} ${state.set.targetLabel}` : ""}</p>
            <Numbers set={state.set} locale={locale} />
            {state.set.previousLabel ? <p className="focus-hint">{vi ? "Lần trước" : "Last time"} <b>{state.set.previousLabel}</b></p> : null}
            {state.set.adviceLabel ? <p className="focus-hint">{vi ? "Gợi ý hôm nay" : "Today's suggestion"} <b>{state.set.adviceLabel}</b></p> : null}
          </>
        ) : null}

        {state.phase === "running" ? (
          <>
            <p className="focus-eyebrow focus-eyebrow--live"><span aria-hidden="true">●</span> {vi ? `Đang tập set ${state.set.setNumber}` : `Set ${state.set.setNumber} in progress`}</p>
            <div className="focus-stopwatch" role="timer" aria-label={`${vi ? "Thời gian set" : "Set time"}: ${state.elapsed} ${vi ? "giây" : "seconds"}`}>{clock(state.elapsed)}</div>
            <Numbers set={state.set} locale={locale} small />
            {!state.canEnd ? <p className="focus-hint focus-hint--warn">{vi ? "Nhập số lần trước khi kết thúc set." : "Enter the reps before ending the set."}</p> : null}
            <button type="button" className="focus-link" onClick={onCancelSet}>{vi ? "Chưa tập, huỷ bấm giờ" : "Not started yet, cancel timing"}</button>
          </>
        ) : null}

        {state.phase === "rest" ? (
          <div className="focus-rest" role="region" aria-label={vi ? "Bộ đếm thời gian nghỉ" : "Rest timer controls"}>
            <p className="focus-eyebrow">{restDone
              ? (vi ? "Hết giờ nghỉ" : "Rest is over")
              : (vi ? "Đang nghỉ" : "Resting")}{state.done?.workSeconds !== undefined ? ` · ${vi ? `set ${state.done.setNumber} xong trong` : `set ${state.done.setNumber} took`} ${clock(state.done.workSeconds)}` : ""}</p>
            <div className="focus-ring">
              <svg viewBox="0 0 200 200" aria-hidden="true">
                <circle className="focus-ring__track" cx="100" cy="100" r="88" />
                <circle className="focus-ring__value" cx="100" cy="100" r="88" strokeDasharray={ringLength} strokeDashoffset={ringLength * (1 - (state.total > 0 ? Math.min(1, state.remaining / state.total) : 0))} />
              </svg>
              <div role="timer" aria-label={`${vi ? "Thời gian nghỉ còn lại" : "Rest time remaining"}: ${state.remaining} ${vi ? "giây" : "seconds"}`}>
                <strong>{restDone ? `+${clock(state.overtime)}` : clock(state.remaining)}</strong>
                <small>{restDone ? (vi ? "quá giờ nghỉ" : "over rest") : `/ ${clock(state.total)}`}</small>
              </div>
            </div>
            <div className="focus-rest__controls">
              <button type="button" aria-label={vi ? "Giảm 15 giây nghỉ" : "Remove 15 seconds of rest"} onClick={() => onRest(-15)}><Minus size={14} />15s</button>
              <button type="button" aria-label={vi ? "Thêm 15 giây nghỉ" : "Add 15 seconds of rest"} onClick={() => onRest(15)}><Plus size={14} />15s</button>
              <button type="button" aria-label={vi ? "Bắt đầu lại giờ nghỉ" : "Restart rest timer"} onClick={onRestartRest}><TimerReset size={16} /></button>
              <button type="button" aria-pressed={!alertMuted} aria-label={vi ? "Âm báo và rung khi hết giờ nghỉ" : "Sound and vibration when rest ends"} title={alertMuted ? (vi ? "Đang tắt âm báo" : "Alert is off") : (vi ? "Đang bật âm báo" : "Alert is on")} onClick={onToggleAlert}>{alertMuted ? <BellOff size={16} /> : <Bell size={16} />}</button>
              <button type="button" onClick={() => onRest(undefined)}>{vi ? "Bỏ qua" : "Skip"}</button>
            </div>
            {state.next?.adviceLabel ? <p className="focus-hint">{vi ? `Gợi ý set ${state.next.setNumber}` : `Suggestion for set ${state.next.setNumber}`} <b>{state.next.adviceLabel}</b></p> : null}
            <p className="focus-note">{lockScreenTimerEnabled ? (vi
              ? "Trên màn hình khóa, bấm Tiếp để kết thúc hoặc bắt đầu set, bấm Trước để bỏ qua giờ nghỉ. Chuông có thể không kêu nếu iPhone dừng âm thanh nền."
              : "On the lock screen, use Next to end or start a set and Previous to skip rest. The bell may not sound if iPhone stops background audio.") : vi
              ? `Chuông chỉ kêu khi app đang mở trên màn hình và iPhone không gạt im lặng.${wakeLockSupported ? "" : " Máy này không giữ sáng màn hình được: hãy tăng thời gian tự khoá."}`
              : `The alert sounds only while the app is open on screen and the iPhone is not on silent.${wakeLockSupported ? "" : " This device cannot keep the screen awake: raise the auto-lock time."}`}</p>
            {state.done ? (
              <div className="focus-just-done" role="group" aria-label={vi ? `Sửa set ${state.done.setNumber} vừa tập` : `Correct set ${state.done.setNumber} just done`}>
                <small>{vi ? "Vừa tập, sửa nếu khác" : "Just done, correct if different"}</small>
                <div>
                  {[state.done.load, state.done.effort, state.done.rir].map((number) => number ? (
                    <span className="focus-edit" key={number.label}>
                      {number.onStep && number.step ? <button type="button" aria-label={vi ? `Giảm ${number.label}` : `Decrease ${number.label}`} onClick={() => number.onStep?.(-number.step!)}><Minus size={15} /></button> : null}
                      <b>{number.value}<i>{number.label}</i></b>
                      {number.onStep && number.step ? <button type="button" aria-label={vi ? `Tăng ${number.label}` : `Increase ${number.label}`} onClick={() => number.onStep?.(number.step!)}><Plus size={15} /></button> : null}
                    </span>
                  ) : null)}
                </div>
              </div>
            ) : null}
            <span className="sr-only" aria-live="assertive">{restDone ? (vi ? "Hết giờ nghỉ, sẵn sàng tập" : "Rest complete, ready") : ""}</span>
          </div>
        ) : null}

        {state.phase === "finished" ? (
          <div className="focus-finished">
            <Check size={34} aria-hidden="true" />
            <h2>{vi ? "Đã xong mọi set" : "Every set is done"}</h2>
            <p>{vi ? "Thêm set hoặc bài bên dưới, hoặc kết thúc buổi tập." : "Add a set or an exercise below, or finish the workout."}</p>
          </div>
        ) : null}
      </section>

      {restDone ? <div className="rest-flash" aria-hidden="true" /> : null}

      <div className={`set-dock set-dock--${action.tone}`}>
        {dockReadout ? <div className={`set-dock__readout set-dock__readout--${dockReadout.tone}`} aria-hidden="true"><small>{dockReadout.label}</small><strong>{dockReadout.value}</strong></div> : null}
        <button type="button" className="set-dock__action" disabled={action.disabled} onClick={action.onClick}>
          {action.icon === "play" ? <Play size={18} fill="currentColor" aria-hidden="true" /> : action.icon === "stop" ? <Square size={16} fill="currentColor" aria-hidden="true" /> : <Check size={19} aria-hidden="true" />}
          <span>{action.label}{action.detail ? <small>{action.detail}</small> : null}</span>
        </button>
      </div>
    </>
  );
}
