export type IncompatibleSnapshotScreenProps = Readonly<{
  onGoHome: () => void;
}>;

export function IncompatibleSnapshotScreen(
  props: IncompatibleSnapshotScreenProps,
) {
  return (
    <main className="app-shell home-shell">
      <section
        className="entry-card notice error-notice"
        role="alert"
        aria-labelledby="incompatible-snapshot-heading"
      >
        <p className="step-label">INCOMPATIBLE ROOM</p>
        <h1 id="incompatible-snapshot-heading">
          이 방을 현재 클라이언트에서 열 수 없습니다.
        </h1>
        <p>
          이 게임 또는 데이터 버전을 현재 클라이언트에서 지원하지
          않습니다.
        </p>
        <button className="secondary-button" type="button" onClick={props.onGoHome}>
          홈으로 돌아가기
        </button>
      </section>
    </main>
  );
}
