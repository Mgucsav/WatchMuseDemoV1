"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type {
  RoomCandidate,
  RoomRound,
  RoomRoundState,
  RoomSelection,
  RoomVoteChoice,
} from "@/lib/rooms/types";
import {
  pollingIntervalFor,
  startPollingLoop,
  WAITING_POLL_INTERVAL_MS,
} from "@/lib/rooms/polling-policy";
import { ensureAnonymousSession } from "@/lib/supabase/browser";

const SWIPE_DISTANCE_PX = 60;

type ViewState =
  | { kind: "loading" }
  | {
      kind: "ready";
      state: RoomRoundState & { round: RoomRound };
    }
  | { kind: "waiting-for-host" }
  | { kind: "error"; message: string };

/**
 * İki kişilik seçim deneyimi.
 *
 * İstemci yalnızca kendi oylarını ve iki taraf bitince ortak adayları alır;
 * partnerin tek tek kararları hiçbir zaman bu bileşene gelmez.
 */
export function RoomRound({
  spaceId,
  isHost,
}: {
  spaceId: string;
  isHost: boolean;
}) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pendingChoice, setPendingChoice] = useState<RoomVoteChoice | null>(null);
  const [startingWheel, setStartingWheel] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [acceptingSelectionId, setAcceptingSelectionId] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    await ensureAnonymousSession();
    let data = await fetchJson<RoomRoundState>(`/api/rooms/${spaceId}/round`, signal);

    // Aday listesi yalnızca ilk kez, oda sahibi tarafından başlatılır. Sunucu
    // aynı anda gelen istekleri kilitlediği için çift başlangıç güvenlidir.
    if (!data.round && isHost) {
      data = await fetchJson<RoomRoundState>(`/api/rooms/${spaceId}/round`, signal, {
        method: "POST",
        body: {},
      });
    }

    if (data.round) {
      setView({ kind: "ready", state: { ...data, round: data.round } });
    }
    else setView({ kind: "waiting-for-host" });
    return data.round;
  }, [isHost, spaceId]);

  const pollInterval =
    view.kind === "loading" || view.kind === "waiting-for-host"
      ? WAITING_POLL_INTERVAL_MS
      : view.kind === "ready"
        ? pollingIntervalFor(view.state.round)
        : null;

  useEffect(() => {
    if (pollInterval === null) return;
    return startPollingLoop(async (signal) => {
      try {
        await refresh(signal);
      } catch (error) {
        if (signal.aborted) return;
        setView({
          kind: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "Seçim turu güncellenemedi.",
        });
      }
    }, pollInterval, { immediate: view.kind === "loading" });
  }, [pollInterval, refresh, view.kind]);

  const submitVote = async (candidateId: string, choice: RoomVoteChoice) => {
    setPendingChoice(choice);
    try {
      await fetchJson(`/api/rooms/${spaceId}/round/votes`, undefined, {
        method: "POST",
        body: { candidateId, choice },
      });
      await refresh();
    } catch (error) {
      setView({
        kind: "error",
        message:
          error instanceof ApiError ? error.message : "Seçiminiz kaydedilemedi.",
      });
    } finally {
      setPendingChoice(null);
    }
  };

  const startWheel = async () => {
    setStartingWheel(true);
    try {
      await fetchJson(`/api/rooms/${spaceId}/round/spin`, undefined, {
        method: "POST",
        body: {},
      });
      await refresh();
    } catch (error) {
      setView({
        kind: "error",
        message:
          error instanceof ApiError ? error.message : "Çark başlatılamadı.",
      });
    } finally {
      setStartingWheel(false);
    }
  };

  const startNextRound = async () => {
    setResetting(true);
    try {
      await fetchJson(`/api/rooms/${spaceId}/round`, undefined, {
        method: "POST",
        body: {},
      });
      await refresh();
    } catch (error) {
      setView({
        kind: "error",
        message:
          error instanceof ApiError ? error.message : "Yeni tur başlatılamadı.",
      });
    } finally {
      setResetting(false);
    }
  };

  const acceptSelection = async (selectionId: string) => {
    setAcceptingSelectionId(selectionId);
    try {
      const data = await fetchJson<RoomRoundState>(
        `/api/rooms/${spaceId}/selection`,
        undefined,
        { method: "POST", body: { selectionId } },
      );
      if (data.round) {
        setView({ kind: "ready", state: { ...data, round: data.round } });
      }
    } catch (error) {
      setView({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "Film izleme listene eklenemedi.",
      });
    } finally {
      setAcceptingSelectionId(null);
    }
  };

  if (view.kind === "loading") {
    return <p className="text-sm text-black/60 dark:text-white/60">Film turu hazırlanıyor…</p>;
  }

  if (view.kind === "waiting-for-host") {
    return (
      <StatusMessage title="Film turu hazırlanıyor">
        Oda sahibinin ortak aday listesini başlatması bekleniyor.
      </StatusMessage>
    );
  }

  if (view.kind === "error") {
    return (
      <StatusMessage tone="error" title="Film turu açılamadı">
        {view.message}
      </StatusMessage>
    );
  }

  const { round, pendingSelections } = view.state;
  const pendingArea = (
    <PendingSelectionArea
      selections={pendingSelections}
      acceptingSelectionId={acceptingSelectionId}
      onAccept={acceptSelection}
    />
  );
  if (round.status === "voting") {
    const nextCandidate = round.candidates.find((candidate) => !round.myVotes[candidate.id]);
    if (nextCandidate) {
      return <div className="space-y-4">{pendingArea}
        <VotingCard
          candidate={nextCandidate}
          completed={round.myVoteCount}
          total={round.candidateCount}
          pendingChoice={pendingChoice}
          onChoose={submitVote}
        />
      </div>;
    }

    return <div className="space-y-4">{pendingArea}
      <StatusMessage title="Seçimlerin tamamlandı">
        Partnerinin gizli seçimlerini bitirmesi bekleniyor. Onun hangi filmleri
        seçtiği, ikiniz de tamamlayana kadar görünmez.
      </StatusMessage>
    </div>;
  }

  if (round.status === "no_match") {
    return <div className="space-y-4">{pendingArea}
      <section className="rounded-xl border border-black/10 p-4 dark:border-white/15">
        <h2 className="font-semibold">Bu turda ortak “izlemek isterim” çıkmadı</h2>
        <p className="mt-1 text-sm text-black/70 dark:text-white/70">
          Yeni ve farklı 10 filmle tekrar deneyebilirsiniz. Eski oylar yeni tura taşınmaz.
        </p>
        <button
          type="button"
          className="mt-4 rounded-md border border-black/30 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/35"
          onClick={() => void startNextRound()}
          disabled={resetting}
        >
          {resetting ? "Yeni tur hazırlanıyor…" : "Yeni 10 film getir"}
        </button>
      </section>
    </div>;
  }

  if (round.status === "matching") {
    return <div className="space-y-4">{pendingArea}
      <MatchStage
        candidates={round.matchedCandidates}
        startingWheel={startingWheel}
        onStart={() => void startWheel()}
      />
    </div>;
  }

  if (round.status === "result") {
    return (
      <div className="space-y-4">
        {pendingArea}
        <WheelStage round={round} />
        <NewRoundButton pending={resetting} onStart={startNextRound} />
      </div>
    );
  }

  return <div className="space-y-4">{pendingArea}<WheelStage round={round} /></div>;
}

function PendingSelectionArea({
  selections,
  acceptingSelectionId,
  onAccept,
}: {
  selections: RoomSelection[];
  acceptingSelectionId: string | null;
  onAccept: (selectionId: string) => Promise<void>;
}) {
  if (selections.length === 0) return null;

  return (
    <section className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <p className="text-sm font-semibold">Odada seçilen filmler</p>
      <div className="mt-3 space-y-3">
        {selections.map((selection) => {
          const deadline = new Intl.DateTimeFormat("tr-TR", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(selection.responseDeadline));

          return (
            <article
              key={selection.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 p-3 dark:border-white/15"
            >
              <div>
                <p className="font-medium">{selection.title}</p>
                <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                  {deadline} tarihine kadar kişisel listene ekleyebilirsin.
                </p>
              </div>
              {selection.myAccepted ? (
                <p className="text-sm font-medium">İzleme listene eklendi</p>
              ) : (
                <button
                  type="button"
                  className="rounded-md border border-black/30 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/35"
                  disabled={acceptingSelectionId !== null}
                  onClick={() => void onAccept(selection.id)}
                >
                  {acceptingSelectionId === selection.id
                    ? "Ekleniyor…"
                    : "İzleme listeme ekle"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function NewRoundButton({
  pending,
  onStart,
}: {
  pending: boolean;
  onStart: () => Promise<void>;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-md border border-black/30 px-3 py-3 text-sm font-semibold disabled:opacity-60 dark:border-white/35"
      onClick={() => void onStart()}
      disabled={pending}
    >
      {pending ? "Yeni tur hazırlanıyor…" : "Yeni 10 filmle devam et"}
    </button>
  );
}

function VotingCard({
  candidate,
  completed,
  total,
  pendingChoice,
  onChoose,
}: {
  candidate: RoomCandidate;
  completed: number;
  total: number;
  pendingChoice: RoomVoteChoice | null;
  onChoose: (candidateId: string, choice: RoomVoteChoice) => Promise<void>;
}) {
  const startedAt = useRef<number | null>(null);
  const busy = pendingChoice !== null;

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    startedAt.current = event.clientX;
  };
  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = startedAt.current;
    startedAt.current = null;
    if (start === null || busy) return;
    const distance = event.clientX - start;
    if (distance >= SWIPE_DISTANCE_PX) void onChoose(candidate.id, "want");
    if (distance <= -SWIPE_DISTANCE_PX) void onChoose(candidate.id, "skip");
  };

  return (
    <section aria-live="polite" className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-semibold">Gizli seçim · {completed + 1} / {total}</p>
        <p className="text-black/60 dark:text-white/60">Sola geç · Sağa iste</p>
      </div>

      <article
        className="mt-4 touch-pan-y rounded-xl border border-dashed border-black/25 p-4 select-none dark:border-white/30"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div className="flex gap-4">
          <CandidatePoster candidate={candidate} />
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{candidate.title}</h2>
            {candidate.originalTitle ? <p className="text-sm text-black/60 dark:text-white/60">{candidate.originalTitle}</p> : null}
            <p className="mt-2 text-sm text-black/70 dark:text-white/70">
              {[candidate.releaseYear, candidate.voteAverage ? `TMDb ${candidate.voteAverage.toFixed(1)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {candidate.overview ? <p className="mt-3 text-sm leading-6 text-black/75 dark:text-white/75">{candidate.overview}</p> : null}
          </div>
        </div>
      </article>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ChoiceButton disabled={busy} onClick={() => void onChoose(candidate.id, "skip")}>
          {pendingChoice === "skip" ? "Kaydediliyor…" : "← İstemiyorum"}
        </ChoiceButton>
        <ChoiceButton disabled={busy} onClick={() => void onChoose(candidate.id, "maybe")}>
          {pendingChoice === "maybe" ? "Kaydediliyor…" : "Belki"}
        </ChoiceButton>
        <ChoiceButton disabled={busy} onClick={() => void onChoose(candidate.id, "want")}>
          {pendingChoice === "want" ? "Kaydediliyor…" : "İsterim →"}
        </ChoiceButton>
      </div>
      <p className="mt-3 text-center text-xs text-black/55 dark:text-white/55">
        Kartı sola veya sağa kaydırmak da aynı kararı verir.
      </p>
    </section>
  );
}

function ChoiceButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-black/30 px-2 py-2 text-sm font-medium disabled:cursor-wait disabled:opacity-60 dark:border-white/35"
    >
      {children}
    </button>
  );
}

function MatchStage({
  candidates,
  startingWheel,
  onStart,
}: {
  candidates: RoomCandidate[];
  startingWheel: boolean;
  onStart: () => void;
}) {
  return (
    <section className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <p className="text-sm font-semibold">Ortak istekleriniz</p>
      <h2 className="mt-1 text-xl font-bold">{candidates.length} filmde buluştunuz</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <article key={candidate.id} className="flex gap-3 rounded-lg border border-black/10 p-2 dark:border-white/15">
            <CandidatePoster candidate={candidate} small />
            <div className="min-w-0">
              <p className="font-medium">{candidate.title}</p>
              {candidate.releaseYear ? <p className="text-sm text-black/60 dark:text-white/60">{candidate.releaseYear}</p> : null}
            </div>
          </article>
        ))}
      </div>
      <button
        type="button"
        className="mt-5 w-full rounded-md bg-black px-3 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-black"
        onClick={onStart}
        disabled={startingWheel}
      >
        {startingWheel ? "Çark başlatılıyor…" : "Ortak çarkı çevir"}
      </button>
      <p className="mt-2 text-center text-xs text-black/55 dark:text-white/55">
        Sonuç sunucuda bir kez seçilir; ikiniz de aynı çarkı görürsünüz.
      </p>
    </section>
  );
}

function WheelStage({ round }: { round: RoomRound }) {
  const candidates = round.matchedCandidates;
  const winningIndex = Math.max(0, candidates.findIndex((candidate) => candidate.id === round.winnerCandidate?.id));
  const [now, setNow] = useState(0);
  const isSpinning = round.status === "spinning";

  useEffect(() => {
    if (!isSpinning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [isSpinning]);

  const { rotation, remaining } = useMemo(() => {
    const duration = round.spinDurationMs;
    const started = round.spinStartedAt ? Date.parse(round.spinStartedAt) : now;
    const elapsed = Math.max(0, Math.min(duration, now - started));
    const finalRotation = 8 * 360 + (candidates.length - winningIndex) * (360 / Math.max(candidates.length, 1));
    return { rotation: (elapsed / duration) * finalRotation, remaining: Math.max(0, duration - elapsed) };
  }, [candidates.length, now, round.spinDurationMs, round.spinStartedAt, winningIndex]);

  const result = round.status === "result" ? round.winnerCandidate : null;
  return (
    <section aria-live="polite" className="rounded-xl border border-black/10 p-4 text-center dark:border-white/15">
      <p className="text-sm font-semibold">{result ? "Bu akşamın önerisi" : "Ortak çark dönüyor"}</p>
      <div className="relative mx-auto mt-5 grid h-60 w-60 place-items-center overflow-hidden rounded-full border-4 border-black/70 bg-black/5 dark:border-white/70 dark:bg-white/10">
        <div className="absolute top-0 z-10 -translate-y-1/2 text-xl" aria-hidden="true">▼</div>
        <div
          className="h-[92%] w-[92%] rounded-full border border-black/30 dark:border-white/30"
          style={{
            background: `conic-gradient(${candidates.map((_, index) => `${index % 2 === 0 ? "#d4d4d4" : "#737373"} ${(index / Math.max(candidates.length, 1)) * 100}% ${((index + 1) / Math.max(candidates.length, 1)) * 100}%`).join(", ")})`,
            transform: `rotate(${rotation}deg)`,
            transition: isSpinning ? "transform 50ms linear" : "none",
          }}
        />
        <div className="absolute grid h-20 w-20 place-items-center rounded-full border border-black/30 bg-white text-xs font-semibold dark:border-white/30 dark:bg-black">
          {result ? "Sonuç" : `${Math.ceil(remaining / 1000)} sn`}
        </div>
      </div>
      {result ? (
        <div className="mt-5">
          <h2 className="text-2xl font-bold">{result.title}</h2>
          {result.originalTitle ? <p className="mt-1 text-sm text-black/60 dark:text-white/60">{result.originalTitle}</p> : null}
          <p className="mt-3 text-sm text-black/70 dark:text-white/70">İkinizin de “izlemek isterim” dediği filmler arasından seçildi.</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-black/70 dark:text-white/70">İkinizin ekranı aynı sunucu zaman damgasına göre dönüyor…</p>
      )}
    </section>
  );
}

function CandidatePoster({ candidate, small = false }: { candidate: RoomCandidate; small?: boolean }) {
  const dimensions = small ? { width: 44, height: 66, className: "h-[66px] w-11" } : { width: 112, height: 168, className: "h-[168px] w-28" };
  if (!candidate.posterUrl) {
    return <div aria-hidden="true" className={`${dimensions.className} shrink-0 rounded bg-black/10 p-2 text-center text-xs text-black/55 dark:bg-white/10 dark:text-white/55`}>Afiş<br />yok</div>;
  }
  return <Image src={candidate.posterUrl} alt={`${candidate.title} afişi`} width={dimensions.width} height={dimensions.height} className={`${dimensions.className} shrink-0 rounded object-cover`} />;
}
