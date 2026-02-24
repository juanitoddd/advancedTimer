import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from './components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table'
import { AiTwotoneSound } from "react-icons/ai";
import { FaPause,FaPlay, FaStop  } from "react-icons/fa";
import { markers } from './markers';

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // const centis = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
  /*
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}.${String(centis).padStart(2, "0")}`;
  */
}

/**
 * Simple beep using Web Audio. Note: browsers require a user gesture
 * before audio can play; calling start() from a click handler satisfies that.
 */
function useBeep() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const beep = useCallback(
    async (durationMs = 120, frequency = 880) => {
      const ctx = ensureCtx();
      // resume if needed (some browsers start suspended)
      if (ctx.state === "suspended") await ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = frequency;

      // quick envelope to avoid clicks
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + durationMs / 1000);
    },
    [ensureCtx]
  );

  return { beep };
}

function cumulativeSum(arr: number[]): number[] {
  let sum = 0;
  return arr.map(num => sum += num);
}

function App() {
  const stopAfterLastMarker = true;
  const markersMinutes = markers.map(m => m.average);
  const markersMinutesAcc = cumulativeSum(markersMinutes);
  const markerMs = useMemo(() => {
    const ms = markersMinutesAcc
      .map((m) => Math.round(m * 60_000))
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b);    
    return ms;    
  }, [markersMinutesAcc]);  

  const { beep } = useBeep();

  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [nextMarkerIndex, setNextMarkerIndex] = useState(0);

  const rafIdRef = useRef<number | null>(null);
  const startPerfRef = useRef<number | null>(null);
  const baseElapsedRef = useRef(0);
  const nextIndexRef = useRef(0);


  const tick = useCallback(() => {
    if (startPerfRef.current == null) return;

    const now = performance.now();
    const currentElapsed = baseElapsedRef.current + (now - startPerfRef.current);

    // Fire markers we crossed; DO NOT STOP
    while (
      nextIndexRef.current < markerMs.length &&
      currentElapsed >= markerMs[nextIndexRef.current]
    ) {
      void beep(120, 880);
      nextIndexRef.current += 1;

      // Optional: stop after last marker
      if (stopAfterLastMarker && nextIndexRef.current >= markerMs.length) {
        // Set elapsed to at least last marker time
        setElapsedMs(currentElapsed);
        setIsRunning(false);
        stop();
        return;
      }
    }

    // Keep UI state in sync
    setNextMarkerIndex(nextIndexRef.current);
    setElapsedMs(currentElapsed);

    rafIdRef.current = requestAnimationFrame(tick);
  }, [beep, markerMs]);


   const start = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    startPerfRef.current = performance.now();
    rafIdRef.current = requestAnimationFrame(tick);
  }, [isRunning, tick]);

  const pause = useCallback(() => {
    if (!isRunning) return;

    const now = performance.now();
    if (startPerfRef.current != null) {
      baseElapsedRef.current += now - startPerfRef.current;
    }

    setIsRunning(false);
    startPerfRef.current = null;

    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    setElapsedMs(baseElapsedRef.current);
  }, [isRunning]);

  const reset = useCallback(() => {
    // stop
    setIsRunning(false);
    startPerfRef.current = null;
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // reset counters
    baseElapsedRef.current = 0;
    nextIndexRef.current = 0;

    // reset UI
    setElapsedMs(0);
    setNextMarkerIndex(0);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // const lastFiredMarkerMs = nextMarkerIndex > 0 ? markerMs[nextMarkerIndex - 1] : 0;
  // const segmentMs = Math.max(0, elapsedMs - lastFiredMarkerMs);

  const nextMarkerMs = nextMarkerIndex < markerMs.length ? markerMs[nextMarkerIndex] : null;
  const timeToNextMs =
    nextMarkerMs != null ? Math.max(0, nextMarkerMs - elapsedMs) : null;


  return (
    <>
      <div className="flex flex-col h-screen w-screen place-items-center p-2">
        <div className="grid grid-cols-3 gap-4 mb-4 w-full">
          {!isRunning ? (
            <Button className="w-full flex items-center justify-center min-h-[80px] text-xl" onClick={start}><FaPlay /> Play</Button>
          ) : (
            <Button className="w-full flex items-center justify-center min-h-[80px] text-xl" onClick={pause}><FaPause /> Pause</Button>
          )}                      
          <Button className="w-full flex items-center justify-center min-h-[80px] text-xl" onClick={reset} disabled={isRunning && elapsedMs < 50}><FaStop /> Reset</Button>
          <Button className="w-full flex items-center justify-center min-h-[80px] text-xl" onClick={() => void beep()} ><AiTwotoneSound /> Test Beep </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4 w-full">          

          <div className=''>
            {/* 
            <div className="text-md opacity-70 mb-4">
              Current (since last beep)
            </div>
            <div className="text-4xl font-mono mb-4">
              {formatMs(segmentMs)}
            </div>
            */}
            {timeToNextMs != null && (
              <>
              <div className='font-bold text-md mb-4'>
                {markers[nextIndexRef.current]?.activity || "Next marker"}
              </div>    
              <div className='text-5xl font-mono mb-4'>
                {formatMs(timeToNextMs)}
              </div>
              {/* 
              <div className='opacity-70 text-md mt-1'>
                At {formatMs(nextMarkerMs!)}
              </div>   
              */}           
              </>
            )}
            {timeToNextMs == null && markerMs.length > 0 && (
              <div className='opacity-70 text-md mt-1'>
                All markers fired.
              </div>
            )}
          </div>

          <div className=''>
            <div className="text-md opacity-70 mb-4 text-right">Total</div>
            <div className="text-3xl opacity-70 font-mono mb-4 text-right">
              {formatMs(elapsedMs)}
            </div>
          </div>

        </div>
        {/* 
        <div className="text-4xl font-mono mb-4">
          {nextIndexRef.current}
        </div>        
        */}        
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead>Activities</TableHead>
              <TableHead className="w-[100px]">Maximum</TableHead>
              <TableHead className="w-[100px]">Average</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {markers.map((marker: any, i: number) => {
              const curr = nextIndexRef.current;              
              return (
              <TableRow key={marker.activity} style={{ opacity:  i <= curr ? 1 : 0.5, backgroundColor: curr == i ? "rgba(34,197,94,0.2)" : "transparent" }}>
                <TableCell className="font-medium" style={{ opacity:  i <= curr ? 1 : 0.5 }}>{marker.activity} { i < curr ? "✓" : ""}</TableCell>
                <TableCell>{marker.maximum} min</TableCell>
                <TableCell>{marker.average} min</TableCell>
              </TableRow>
            )})}
            <TableRow key={'Total'} style={{ opacity: 0.5 }}>
                <TableCell className="font-medium font-bold">Total</TableCell>
                <TableCell>{Math.round(markers.reduce((acc: any, marker: any) => acc + marker.maximum, 0))} min</TableCell>
                <TableCell>{Math.round(markers.reduce((acc: any, marker: any) => acc + marker.average, 0))} min</TableCell>
              </TableRow>
          </TableBody>
        </Table>
      </div>
    </>
  )
}

export default App
