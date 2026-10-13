"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
type Suit = "hearts" | "diamonds" | "clubs" | "spades";
type Player = { user_id: string; display_name: string; seat: number; score: number; card_suit: Suit };
type RoundResult = {
  round: number; prize: number; prize_suit: Suit; tie: boolean;
  your_card: number; opponent_card: number; your_suit: Suit;
  opponent_suit: Suit; winner_user_id: string | null;
};
function rankLabel(rank: number): string {
  return ({ 1: "A", 11: "J", 12: "Q", 13: "K" } as Record<number, string>)[rank] ?? String(rank);
}
function suitSymbol(suit?: Suit | null): string {
  return ({ hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" } as Record<string, string>)[suit ?? "spades"];
}
function suitColor(suit?: Suit | null): string {
  return suit === "hearts" || suit === "diamonds" ? "text-red-600" : "text-slate-900";
}
function PlayingCard({ rank, suit, selected = false, disabled = false, onClick }: {
  rank: number; suit?: Suit | null; selected?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected}
      className={`relative flex w-full aspect-[3/4] min-w-0 flex-col items-center justify-center rounded-xl border-2 transition ${
        selected ? "-translate-y-1 border-amber-300 bg-amber-200 shadow-lg" : "border-emerald-700 bg-[#fff8e8] hover:border-amber-300"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <span className={`absolute left-2 top-1 text-sm font-black sm:text-base ${suitColor(suit)}`}>
        {rankLabel(rank)}<span className="block text-sm leading-none">{suitSymbol(suit)}</span>
      </span>
      <span className={`text-3xl font-black sm:text-4xl ${suitColor(suit)}`}>{suitSymbol(suit)}</span>
      <span className={`absolute bottom-1 right-2 rotate-180 text-sm font-black sm:text-base ${suitColor(suit)}`}>
        {rankLabel(rank)}<span className="block text-sm leading-none">{suitSymbol(suit)}</span>
      </span>
    </button>
  );
}
type GameState = {
  game_id: string;
  room_code: string;
  status: "waiting" | "active" | "finished";
  current_round: number;
  players: Player[];
  your_hand: number[];
  your_submitted_card: number | null;
  current_prize: number | null;
  prize_suit: Suit;
  opponent_submitted: boolean;
  last_result: RoundResult | null;
};
export default function Home() {
  const [name, setName] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [submittedForRound, setSubmittedForRound] =
    useState<number | null>(null);
  const [changingCard, setChangingCard] = useState(false);
  const [pendingResult, setPendingResult] = useState<RoundResult | null>(null);
  const [dismissedResultRound, setDismissedResultRound] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Connecting...");
  const [userId, setUserId] = useState("");
  useEffect(() => {
    async function initialize() {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setMessage(error.message);
        return;
      }
      let session = data.session;
      if (!session) {
        const result = await supabase.auth.signInAnonymously();
        if (result.error) {
          setMessage(
            "Could not sign in as a guest. Check that Anonymous Sign-Ins are enabled in Supabase."
          );
          return;
        }
        session = result.data.session;
      }
      if (session) {
        setUserId(session.user.id);
        setReady(true);
        setMessage("Ready to play.");
      }
    }
    void initialize();
  }, []);
  const refreshGame = useCallback(async () => {
    if (!roomCode) return;
    const { data, error } = await supabase.rpc("get_game_state", {
      p_room_code: roomCode,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    const next = data as GameState;
    setGame(next);
    setSubmittedForRound((previous) =>
      previous !== null && previous !== next.current_round ? null : previous
    );
    if (next.last_result && next.last_result.round > dismissedResultRound) {
      setPendingResult((current) => current ?? next.last_result);
    }
  }, [roomCode, dismissedResultRound]);
  useEffect(() => {
    if (!roomCode || !ready) return;
    void refreshGame();
    const interval = window.setInterval(() => {
      void refreshGame();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [roomCode, ready, refreshGame]);
  async function createGame() {
    if (!name.trim() || !ready || busy) return;
    setBusy(true);
    setMessage("Creating your room...");
    try {
      const { data, error } = await supabase.rpc("create_game", {
        p_display_name: name.trim(),
      });
      if (error) throw error;
      const result = data as {
        room_code: string;
        game_id: string;
      };
      setRoomCode(result.room_code);
      setDismissedResultRound(0);
      setPendingResult(null);
      setSelectedCard(null);
      setMessage("Room created! Share the code with your friend.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create room."
      );
    } finally {
      setBusy(false);
    }
  }
  async function joinGame() {
    if (!name.trim() || !roomInput.trim() || !ready || busy) return;
    setBusy(true);
    setMessage("Joining room...");
    try {
      const { data, error } = await supabase.rpc("join_game", {
        p_room_code: roomInput.trim().toUpperCase(),
        p_display_name: name.trim(),
      });
      if (error) throw error;
      const result = data as { room_code: string };
      setRoomCode(result.room_code);
      setDismissedResultRound(0);
      setPendingResult(null);
      setSelectedCard(null);
      setMessage("Joined! Waiting for the game to load...");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not join room."
      );
    } finally {
      setBusy(false);
    }
  }
  async function submitCard() {
    if (
      !game ||
      selectedCard === null ||
      submittedForRound === game.current_round ||
      busy
    ) {
      return;
    }
    setBusy(true);
    setMessage("Locking in your card...");
    try {
      const { error } = await supabase.rpc("submit_play", {
        p_room_code: roomCode,
        p_card: selectedCard,
      });
      if (error) throw error;
      setSubmittedForRound(game.current_round);
      setSelectedCard(null);
      setMessage("Card locked! Waiting for your opponent...");
      await refreshGame();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not submit card."
      );
    } finally {
      setBusy(false);
    }
  }
  async function replaceCard() {
    if (!game || selectedCard === null || busy || game.opponent_submitted) return;
    setBusy(true);
    setMessage("Changing your card...");
    try {
      const { error } = await supabase.rpc("replace_play", {
        p_room_code: roomCode, p_card: selectedCard,
      });
      if (error) throw error;
      setSelectedCard(null);
      setChangingCard(false);
      setMessage("Card changed. Waiting for your opponent...");
      await refreshGame();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change card.");
    } finally {
      setBusy(false);
    }
  }
  const me = game?.players.find((player) => player.user_id === userId);
  const opponent = game?.players.find((player) => player.user_id !== userId);
  const alreadySubmitted = game !== null && game.your_submitted_card !== null;
  return (
    <main className="min-h-screen bg-[#10231f] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] text-emerald-300">
              TWO PLAYER STRATEGY
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
              Pure Strategy
            </h1>
            <p className="mt-2 text-sm text-emerald-100/70">
              Read your opponent. Spend your cards wisely.
            </p>
          </div>
          <div className="hidden rounded-full border border-emerald-800 px-4 py-2 text-sm sm:block">
            GOOFSPIEL
          </div>
        </header>
        {!game && (
          <section className="mx-auto max-w-xl rounded-3xl border border-emerald-900 bg-[#19352e] p-6 shadow-2xl sm:p-8">
            <h2 className="text-2xl font-bold">Play with a friend</h2>
            <p className="mt-2 text-sm text-emerald-100/70">
              Create a private room or enter your friend&apos;s room code.
            </p>
            <label className="mt-6 block text-sm font-medium">
              Your display name
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              placeholder="Enter a username"
              className="mt-2 w-full rounded-xl border border-emerald-800 bg-[#10231f] px-4 py-3 outline-none focus:border-emerald-400"
            />
            <button
              onClick={createGame}
              disabled={!ready || busy || !name.trim()}
              className="mt-5 w-full rounded-xl bg-emerald-300 px-4 py-3 font-bold text-[#10231f] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Please wait..." : "Create a room"}
            </button>
            <div className="my-6 flex items-center gap-4 text-xs text-emerald-100/40">
              <div className="h-px flex-1 bg-emerald-800" />
              OR JOIN A FRIEND
              <div className="h-px flex-1 bg-emerald-800" />
            </div>
            <div className="flex gap-2">
              <input
                value={roomInput}
                onChange={(event) =>
                  setRoomInput(event.target.value.toUpperCase())
                }
                maxLength={6}
                placeholder="ROOM CODE"
                className="min-w-0 flex-1 rounded-xl border border-emerald-800 bg-[#10231f] px-4 py-3 uppercase tracking-widest outline-none focus:border-emerald-400"
              />
              <button
                onClick={joinGame}
                disabled={
                  !ready ||
                  busy ||
                  !name.trim() ||
                  roomInput.trim().length !== 6
                }
                className="rounded-xl border border-emerald-500 px-5 py-3 font-semibold transition hover:bg-emerald-900 disabled:opacity-40"
              >
                Join
              </button>
            </div>
            <p className="mt-5 text-sm text-emerald-200/80" role="status">
              {message}
            </p>
          </section>
        )}
        {game && (
          <>
            <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-900 bg-[#19352e] p-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-emerald-200/60">
                  Room code
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-3xl font-black tracking-[0.2em]">
                    {game.room_code}
                  </span>
                  <button
                    onClick={() =>
                      void navigator.clipboard.writeText(game.room_code)
                    }
                    className="rounded-lg border border-emerald-700 px-3 py-2 text-sm hover:bg-emerald-900"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
                {game.status === "waiting"
                  ? "Waiting for friend"
                  : game.status === "finished"
                    ? "Game finished"
                    : `Round ${game.current_round} of 13`}
              </div>
            </section>
            <section className="mb-6 grid grid-cols-2 gap-3">
              {[me, opponent].map((player, index) => (
                <div
                  key={player?.user_id ?? index}
                  className="rounded-2xl border border-emerald-900 bg-[#19352e] p-5"
                >
                  <p className="truncate text-sm text-emerald-200/70">
                    {player?.display_name ??
                      (index === 0 ? "You" : "Opponent")}
                    {player?.user_id === userId ? " (You)" : ""}
                  </p>
                  {player && (
                    <p className={`mt-1 text-lg ${suitColor(player.card_suit)}`}>
                      {suitSymbol(player.card_suit)}{" "}
                      <span className="text-xs text-emerald-100/60">
                        {player.seat === 1 ? "Host suit" : "Player suit"}
                      </span>
                    </p>
                  )}
                  <p className="mt-2 text-3xl font-black">
                    {player?.score ?? 0}
                    <span className="ml-2 text-sm font-normal text-emerald-200/50">
                      points
                    </span>
                  </p>
                  {index === 1 && !opponent && (
                    <p className="mt-2 text-xs text-emerald-200/60">
                      Share the room code to invite a friend.
                    </p>
                  )}
                </div>
              ))}
            </section>
            {game.status === "waiting" && (
              <section className="rounded-2xl border border-dashed border-emerald-700 p-10 text-center">
                <div className="text-4xl">♧</div>
                <h2 className="mt-4 text-xl font-bold">
                  Your table is ready
                </h2>
                <p className="mt-2 text-emerald-100/70">
                  Send your friend the room code above. The game starts when
                  they join.
                </p>
              </section>
            )}
            {game.status === "active" && (
              <>
                <section className="mb-6 rounded-3xl border border-emerald-900 bg-[#19352e] p-6 text-center sm:p-10">
                  <p className="text-xs font-semibold tracking-[0.25em] text-emerald-200/60">
                    PRIZE CARD
                  </p>
                  <div className="mx-auto mt-4 flex h-36 w-24 flex-col items-center justify-center rounded-2xl border-2 border-amber-300/70 bg-[#fff8e8] text-[#19352e] shadow-xl">
                    <span className={`text-2xl ${suitColor(game.prize_suit)}`}>{suitSymbol(game.prize_suit)}</span>
                    <span className={`text-5xl font-black ${suitColor(game.prize_suit)}`}>
                      {game.current_prize === null ? "?" : rankLabel(game.current_prize)}
                    </span>
                    <span className={`text-xl ${suitColor(game.prize_suit)}`}>{suitSymbol(game.prize_suit)}</span>
                    <span className="text-xs font-bold tracking-widest">
                      {game.current_prize ?? 0} POINTS
                    </span>
                  </div>
                  <p className="mt-5 text-sm text-emerald-100/70">
                    {alreadySubmitted
                      ? "Your card is locked in."
                      : "Choose one card from your hand."}
                  </p>
                  <p className="mt-1 text-xs text-emerald-200/50">
                    Ties discard the prize. No carryover.
                  </p>
                </section>
                <section className="rounded-3xl border border-emerald-900 bg-[#19352e] p-5 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold">Your hand</h2>
                    <span className="text-sm text-emerald-200/60">
                      {game.your_hand.length} cards remaining
                    </span>
                  </div>
                  <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
                    {game.your_hand.map((card) => (
                    <PlayingCard
                      key={card}
                      rank={card}
                      suit={me?.card_suit}
                      selected={selectedCard === card}
                      disabled={busy || (alreadySubmitted && !changingCard) || (alreadySubmitted && game.opponent_submitted)}
                      onClick={() => setSelectedCard(card)}
                    />
                  ))}
                  </div>
                  {alreadySubmitted && (
                  <div className="mt-5 flex flex-col items-center gap-3">
                    <p className="text-sm text-emerald-100/70">Your locked card</p>
                    <div className="w-20">
                      <PlayingCard rank={game.your_submitted_card!} suit={me?.card_suit} disabled />
                    </div>
                    {!game.opponent_submitted && !changingCard && (
                      <button type="button" onClick={() => { setChangingCard(true); setSelectedCard(null); }}
                        disabled={busy}
                        className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-300/10 disabled:opacity-40">
                        Change locked card
                      </button>
                    )}
                    {changingCard && !game.opponent_submitted && (
                      <p className="text-center text-sm text-amber-200">
                        Choose a different card from your remaining hand, then replace your locked card.
                      </p>
                    )}
                    {game.opponent_submitted && (
                      <p className="text-center text-sm font-semibold text-amber-200">
                        Opponent locked in. Their card stays hidden until the round resolves.
                      </p>
                    )}
                  </div>
                )}
                <button
                  onClick={alreadySubmitted ? replaceCard : submitCard}
                  disabled={selectedCard === null || busy || (alreadySubmitted && (!changingCard || game.opponent_submitted))}
                  className="mt-6 w-full rounded-xl bg-emerald-300 px-4 py-4 font-bold text-[#10231f] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Please wait..." : alreadySubmitted
                    ? changingCard
                      ? selectedCard === null ? "Select a replacement card" : `Replace with ${rankLabel(selectedCard)}`
                      : "Card locked in"
                    : selectedCard === null ? "Select a card" : `Play ${rankLabel(selectedCard)}`}
                </button>
                {changingCard && !game.opponent_submitted && (
                  <button type="button" onClick={() => { setChangingCard(false); setSelectedCard(null); }}
                    className="mt-3 w-full rounded-xl border border-emerald-700 px-4 py-3 text-sm text-emerald-100/80 hover:bg-emerald-900">
                    Cancel card change
                  </button>
                )}
                <p className="mt-4 text-center text-sm text-emerald-200/70" role="status">
                  {game.opponent_submitted && !alreadySubmitted
                    ? "Opponent locked in — waiting for you to play your card."
                    : alreadySubmitted
                      ? game.opponent_submitted
                        ? "Both plays are in. Updating results..."
                        : changingCard ? "You can change your card until your opponent submits." : "Card locked — waiting for opponent."
                      : message}
                </p>
                </section>
              </>
            )}
            {pendingResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
              role="dialog" aria-modal="true" aria-labelledby="round-result-title">
              <section className="w-full max-w-lg rounded-3xl border border-emerald-700 bg-[#19352e] p-6 shadow-2xl sm:p-8">
                <p className="text-center text-xs font-semibold tracking-[0.25em] text-emerald-200/60">
                  ROUND {pendingResult.round} COMPLETE
                </p>
                <h2 id="round-result-title" className="mt-2 text-center text-3xl font-black">
                  {pendingResult.tie ? "It's a tie!" : pendingResult.winner_user_id === userId ? "You won the prize!" : "Your opponent won!"}
                </h2>
                <p className="mt-2 text-center text-sm text-emerald-100/70">
                  {pendingResult.tie ? "Neither card wins. The prize is discarded." : `${pendingResult.prize} point${pendingResult.prize === 1 ? "" : "s"} awarded to the winner.`}
                </p>
                <div className="mt-6 grid grid-cols-3 items-center gap-3">
                  <div className="flex flex-col items-center">
                    <p className="mb-2 text-xs text-emerald-100/60">You played</p>
                    <div className="w-full max-w-28"><PlayingCard rank={pendingResult.your_card} suit={pendingResult.your_suit} disabled /></div>
                  </div>
                  <div className="flex flex-col items-center">
                    <p className="mb-2 text-xs text-emerald-100/60">Prize</p>
                    <div className="flex aspect-[3/4] w-full max-w-28 flex-col items-center justify-center rounded-xl border-2 border-amber-300 bg-[#fff8e8] shadow-lg">
                      <span className={`text-4xl font-black ${suitColor(pendingResult.prize_suit)}`}>{rankLabel(pendingResult.prize)}</span>
                      <span className={`text-3xl ${suitColor(pendingResult.prize_suit)}`}>{suitSymbol(pendingResult.prize_suit)}</span>
                      <span className="mt-1 text-[10px] font-bold tracking-widest text-[#19352e]">{pendingResult.prize} PTS</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <p className="mb-2 text-xs text-emerald-100/60">Opponent</p>
                    <div className="w-full max-w-28"><PlayingCard rank={pendingResult.opponent_card} suit={pendingResult.opponent_suit} disabled /></div>
                  </div>
                </div>
                <button type="button"
                  onClick={() => { setDismissedResultRound(pendingResult.round); setPendingResult(null); }}
                  className="mt-7 w-full rounded-xl bg-emerald-300 px-4 py-3 font-bold text-[#10231f] transition hover:bg-emerald-200">
                  {pendingResult.round === 13 ? "View final score" : "Continue to next round"}
                </button>
              </section>
            </div>
          )}

          {game.status === "finished" && (
              <section className="rounded-3xl border border-emerald-800 bg-[#19352e] p-10 text-center">
                <h2 className="text-3xl font-black">Game over!</h2>
                <p className="mt-3 text-emerald-100/70">
                  {me && opponent && me.score > opponent.score
                    ? "Congratulations, you won!"
                    : me && opponent && me.score < opponent.score
                      ? "Your opponent won this game."
                      : "It's a draw!"}
                </p>
                <button
                  onClick={() => {
                    setGame(null);
                    setRoomCode("");
                    setSelectedCard(null);
                    setSubmittedForRound(null);
                    setDismissedResultRound(0);
                    setPendingResult(null);
                    setMessage("Ready to play again.");
                  }}
                  className="mt-6 rounded-xl bg-emerald-300 px-6 py-3 font-bold text-[#10231f] hover:bg-emerald-200"
                >
                  Back to lobby
                </button>
              </section>
            )}
            <button
              onClick={() => {
                setGame(null);
                setRoomCode("");
                setSelectedCard(null);
                setDismissedResultRound(0);
                setPendingResult(null);
                setSubmittedForRound(null);
              }}
              className="mt-6 text-sm text-emerald-200/60 underline hover:text-white"
            >
              Leave view and return to lobby
            </button>
          </>
        )}
        <footer className="mt-12 text-center text-xs text-emerald-100/30">
          PURE STRATEGY · THINK AHEAD
        </footer>
      </div>
    </main>
  );
}
