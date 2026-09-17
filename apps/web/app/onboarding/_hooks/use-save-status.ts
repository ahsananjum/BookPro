"use client";

import { useState, useCallback } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useSaveStatus() {
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const startSaving = useCallback(() => {
        setSaveState("saving");
        setErrorMessage(null);
    }, []);

    const finishSaved = useCallback(() => {
        setSaveState("saved");
        setErrorMessage(null);
        const timer = setTimeout(() => {
            setSaveState("idle");
        }, 2500);
        return () => clearTimeout(timer);
    }, []);

    const failSaving = useCallback((msg: string) => {
        setSaveState("error");
        setErrorMessage(msg);
    }, []);

    const resetSaveState = useCallback(() => {
        setSaveState("idle");
        setErrorMessage(null);
    }, []);

    return {
        saveState,
        errorMessage,
        startSaving,
        finishSaved,
        failSaving,
        resetSaveState,
    };
}
