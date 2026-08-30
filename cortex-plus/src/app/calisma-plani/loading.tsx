import "@/styles/study-plan.css";

export default function CalismaPlaniLoading() {
  return (
    <div className="ap-plan-page ap-plan-page--loading" aria-busy aria-label="Yükleniyor">
      <div className="ap-plan-ambient" aria-hidden />
      <div className="ap-plan-skel mb-4 h-8 w-36" />
      <div className="ap-plan-skel mb-3 h-16 w-72 max-w-full" />
      <div className="ap-plan-skel mb-6 h-12 w-full max-w-md" />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="ap-plan-skel h-20" />
        <div className="ap-plan-skel h-20" />
        <div className="ap-plan-skel h-20" />
      </div>
      <div className="ap-plan-skel mb-4 h-36 w-full" />
      <div className="ap-plan-skel h-48 w-full" />
    </div>
  );
}
