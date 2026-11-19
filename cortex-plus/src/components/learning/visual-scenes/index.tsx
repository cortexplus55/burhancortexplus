"use client";

import type { AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import { sceneFrame, type SceneChrome, type SceneMode } from "@/lib/learning/visual-scenes/layout";
import type { ReelVisual, VisualScene } from "@/lib/learning/visual-scenes/schema";
import { ArchitecturalBlueprintScene } from "./ArchitecturalBlueprintScene";
import { ComparisonMatrixScene } from "./ComparisonMatrixScene";
import { DocumentSpotlightScene } from "./DocumentSpotlightScene";
import { ExamTrapScene } from "./ExamTrapScene";
import { LawDecisionScene } from "./LawDecisionScene";
import { MathGraphScene } from "./MathGraphScene";
import { MechanicsVectorScene } from "./MechanicsVectorScene";
import { MedicalPathwayScene } from "./MedicalPathwayScene";
import { MemoryNailScene } from "./MemoryNailScene";
import { ReelHookScene } from "./ReelHookScene";
import type { SceneAnimate } from "./scene-kit";
import "@/styles/visual-scenes.css";

export type VisualSceneProps = {
  scene: VisualScene;
  mode: SceneMode;
  chrome?: SceneChrome;
  domain?: AcademicDomain;
  animate?: SceneAnimate;
  playing?: boolean;
  className?: string;
};

/** Arketip verisini kendi bileşenine yollar (6 arketip). */
export function VisualSceneRenderer({ scene, mode, chrome = "lesson", domain, animate, playing, className }: VisualSceneProps) {
  const common = { frame: sceneFrame(mode, chrome), animate, playing, className };
  switch (scene.archetype) {
    case "MEDICAL_BIOLOGY_PATHWAY":
      return <MedicalPathwayScene data={scene} domain={domain} {...common} />;
    case "ENGINEERING_PHYSICS_MECHANICS":
      return <MechanicsVectorScene data={scene} domain={domain} {...common} />;
    case "ARCHITECTURE_SPATIAL_BLUEPRINT":
      return <ArchitecturalBlueprintScene data={scene} domain={domain} {...common} />;
    case "LAW_SOCIAL_FLOWCHART":
      return <LawDecisionScene data={scene} domain={domain} {...common} />;
    case "MATH_ALGORITHMIC_GRAPH":
      return <MathGraphScene data={scene} domain={domain} {...common} />;
    case "DOCUMENT_FIGURE_SPOTLIGHT":
      return <DocumentSpotlightScene data={scene} {...common} />;
  }
}

/** 1 dk çizimli videonun bir sahnesi (5 sahneli akış). */
export function ReelSceneRenderer({
  visual,
  mode,
  domain,
  animate = "sync",
  playing,
  className,
}: {
  visual: ReelVisual;
  mode: SceneMode;
  domain?: AcademicDomain;
  animate?: SceneAnimate;
  playing?: boolean;
  className?: string;
}) {
  const common = { frame: sceneFrame(mode, "video"), animate, playing, className };
  switch (visual.kind) {
    case "hook":
      return <ReelHookScene data={visual} domain={domain} {...common} />;
    case "archetype":
      return <VisualSceneRenderer scene={visual.scene} mode={mode} chrome="video" domain={domain} animate={animate} playing={playing} className={className} />;
    case "comparison":
      return <ComparisonMatrixScene data={visual} {...common} />;
    case "exam_trap":
      return <ExamTrapScene data={visual} {...common} />;
    case "memory_nail":
      return <MemoryNailScene data={visual} {...common} />;
  }
}

export { MedicalPathwayScene, MechanicsVectorScene, ArchitecturalBlueprintScene, LawDecisionScene, MathGraphScene, DocumentSpotlightScene };
