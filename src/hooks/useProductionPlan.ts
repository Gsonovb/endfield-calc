import { calculateProductionPlan } from "@/lib/calculator";
import { items, recipes, facilities, MAX_TARGETS } from "@/data";
import { useState, useMemo, useCallback, useRef } from "react";
import type { ProductionTarget } from "@/components/panels/TargetItemsGrid";
import type { ItemId, RecipeId, ProductionDependencyGraph, ProductionGraphNode } from "@/types";
import { useTranslation } from "react-i18next";
import { useProductionStats } from "./useProductionStats";
import { useProductionTable } from "./useProductionTable";

interface SavedPlan {
  version: string;
  targets: { itemId: string; rate: number }[];
  recipeOverrides: Record<string, string>;
  manualRawMaterials: string[];
  ceilMode: boolean;
}

export function useProductionPlan() {
  const { t } = useTranslation("app");

  const [targets, setTargets] = useState<ProductionTarget[]>([]);
  const [recipeOverrides, setRecipeOverrides] = useState<Map<ItemId, RecipeId>>(
    new Map(),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"table" | "tree">("table");
  const [manualRawMaterials, setManualRawMaterials] = useState<Set<ItemId>>(
    new Set(),
  );
  const [ceilMode, setCeilMode] = useState(false);

  // Core calculation: only returns dependency tree and cycles
  const { plan, error } = useMemo(() => {
    let plan = null;
    let error: string | null = null;

    try {
      if (targets.length > 0) {
        plan = calculateProductionPlan(
          targets,
          items,
          recipes,
          facilities,
          recipeOverrides,
          manualRawMaterials,
        );
      }
    } catch (e) {
      error = e instanceof Error ? e.message : t("calculationError");
    }

    return { plan, error };
  }, [targets, recipeOverrides, manualRawMaterials, t]);

  // Derive ceiled plan when ceilMode is on
  const displayPlan = useMemo(() => {
    if (!plan || !ceilMode) return plan;
    const ceiledNodes = new Map<string, ProductionGraphNode>();
    for (const [key, node] of plan.nodes) {
      if (node.type === "recipe") {
        ceiledNodes.set(key, { ...node, facilityCount: Math.ceil(node.facilityCount) });
      } else {
        ceiledNodes.set(key, node);
      }
    }
    return { ...plan, nodes: ceiledNodes } as ProductionDependencyGraph;
  }, [plan, ceilMode]);

  // View-specific data: computed in view layer hooks
  const stats = useProductionStats(displayPlan, manualRawMaterials);
  const tableData = useProductionTable(
    displayPlan,
    recipes,
    recipeOverrides,
    manualRawMaterials,
  );

  const handleTargetChange = useCallback((index: number, rate: number) => {
    setTargets((prev) => {
      const newTargets = [...prev];
      newTargets[index].rate = rate;
      return newTargets;
    });
  }, []);

  const handleTargetRemove = useCallback((index: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleBatchAddTargets = useCallback(
    (newTargets: { itemId: ItemId; rate: number }[]) => {
      setTargets((prev) => {
        const existingIds = new Set(prev.map((t) => t.itemId));
        const unique = newTargets.filter((t) => !existingIds.has(t.itemId));
        return [...prev, ...unique].slice(0, MAX_TARGETS);
      });
    },
    [],
  );

  const handleRecipeChange = useCallback(
    (itemId: ItemId, recipeId: RecipeId) => {
      setRecipeOverrides((prev) => {
        const newMap = new Map(prev);
        newMap.set(itemId, recipeId);
        return newMap;
      });
    },
    [],
  );

  const handleAddClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleToggleRawMaterial = useCallback((itemId: ItemId) => {
    setManualRawMaterials((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSavePlan = useCallback(() => {
    const data: SavedPlan = {
      version: "1",
      targets: targets.map((t) => ({ itemId: t.itemId, rate: t.rate })),
      recipeOverrides: Object.fromEntries(recipeOverrides),
      manualRawMaterials: Array.from(manualRawMaterials),
      ceilMode,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "production-plan.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [targets, recipeOverrides, manualRawMaterials, ceilMode]);

  const handleOpenPlan = useCallback(() => {
    if (!fileInputRef.current) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target?.result as string) as SavedPlan;
            if (data.version !== "1") return;
            setTargets(
              data.targets.map((t) => ({ itemId: t.itemId as ItemId, rate: t.rate })),
            );
            setRecipeOverrides(
              new Map(
                Object.entries(data.recipeOverrides).map(([k, v]) => [
                  k as ItemId,
                  v as RecipeId,
                ]),
              ),
            );
            setManualRawMaterials(new Set(data.manualRawMaterials as ItemId[]));
            setCeilMode(data.ceilMode);
          } catch {
            // ignore invalid files
          }
        };
        reader.readAsText(file);
      };
      fileInputRef.current = input;
    }
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }, []);

  return {
    targets,
    setTargets,
    recipeOverrides,
    setRecipeOverrides,
    dialogOpen,
    setDialogOpen,
    activeTab,
    setActiveTab,
    plan: displayPlan,
    tableData,
    stats,
    error,
    ceilMode,
    setCeilMode,
    handleTargetChange,
    handleTargetRemove,
    handleBatchAddTargets,
    handleToggleRawMaterial,
    handleRecipeChange,
    handleAddClick,
    handleSavePlan,
    handleOpenPlan,
  };
}
