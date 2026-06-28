"use client";

import React, { useState, useEffect } from 'react';
import { Chess, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ChessPage() {
  const [game, setGame] = useState<Chess | null>(null);
  const [solution, setSolution] = useState<string[]>([]);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "playing" | "solved" | "failed">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [orientation, setOrientation] = useState<"white" | "black">("white");

  useEffect(() => {
    fetch('https://lichess.org/api/puzzle/daily')
      .then(res => res.json())
      .then(data => {
        const c = new Chess(data.puzzle.fen);
        setGame(c);
        setSolution(data.puzzle.solution);
        setOrientation(c.turn() === 'w' ? 'white' : 'black');
        setStatus("playing");
      })
      .catch(err => {
        console.error(err);
        setStatus("failed");
        setErrorMsg("Failed to load daily puzzle.");
      });
  }, []);

  function onDrop({ sourceSquare, targetSquare, piece }: { sourceSquare: string, targetSquare: string | null, piece: any }) {
    if (status !== "playing" || !game || !targetSquare) return false;

    // Extract piece string if piece is an object
    const pieceStr = typeof piece === 'string' ? piece : piece.pieceType || piece.piece || '';

    // Check if move is legal
    const possibleMoves = game.moves({ verbose: true }) as Move[];
    let validMove = possibleMoves.find(m => m.from === sourceSquare && m.to === targetSquare);
    
    // Check for pawn promotion (always queen for simplicity unless specified)
    if (!validMove && (pieceStr[1] === 'P' || pieceStr[1] === 'p') && (targetSquare[1] === '1' || targetSquare[1] === '8')) {
        validMove = possibleMoves.find(m => m.from === sourceSquare && m.to === targetSquare && m.promotion === 'q');
    }

    if (!validMove) return false;

    // Check if it matches the solution
    const expectedMove = solution[moveIndex];
    let userUci = validMove.from + validMove.to + (validMove.promotion || '');
    
    if (userUci === expectedMove) {
      // Correct move
      const newGame = new Chess(game.fen());
      newGame.move(validMove);
      setGame(newGame);
      
      const nextIdx = moveIndex + 1;
      
      if (nextIdx === solution.length) {
        setStatus("solved");
      } else {
        // Opponent's automatic response
        setMoveIndex(nextIdx + 1);
        setTimeout(() => {
          const oppGame = new Chess(newGame.fen());
          const oppMoveUci = solution[nextIdx];
          const oppFrom = oppMoveUci.substring(0, 2);
          const oppTo = oppMoveUci.substring(2, 4);
          const oppProm = oppMoveUci.length > 4 ? oppMoveUci[4] : undefined;
          oppGame.move({ from: oppFrom, to: oppTo, promotion: oppProm });
          setGame(oppGame);
          
          if (nextIdx + 1 === solution.length) {
             setStatus("solved");
          }
        }, 500);
      }
      return true;
    } else {
      // Wrong move
      setStatus("failed");
      setErrorMsg("Incorrect move! Try again tomorrow.");
      return false; // reject the piece drop on the board
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <Link href="/" className="inline-flex items-center gap-2 text-editorial-muted hover:text-editorial-text mb-8 transition-colors text-sm uppercase tracking-widest font-bold">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>
      
      <div className="flex justify-between items-end mb-8 border-b border-editorial-border pb-4">
        <div>
          <h1 className="text-4xl font-serif font-black tracking-tight text-editorial-text uppercase mb-2">
            Chess Problem of the Day
          </h1>
          <p className="text-editorial-muted font-sans text-sm max-w-2xl">
            Test your strategic vision. Can you solve the daily Lichess puzzle?
          </p>
        </div>
      </div>

      <div className="bg-editorial-bg border border-editorial-border p-8 shadow-sm flex flex-col md:flex-row gap-12 items-center justify-center">
         {status === "loading" && <div className="text-xl font-serif italic text-editorial-muted p-12">Loading daily puzzle...</div>}
         
         {game && (
           <div className="w-full max-w-[450px]">
             <Chessboard 
                options={{
                  position: game.fen(),
                  onPieceDrop: onDrop,
                  boardOrientation: orientation,
                  boardStyle: {
                    borderRadius: '4px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                  }
                }}
             />
           </div>
         )}
         
         <div className="flex flex-col gap-6 text-center md:text-left min-w-[200px]">
            {status === "playing" && (
                <div>
                   <h2 className="text-2xl font-black uppercase text-[#005587] dark:text-[#60a5fa] mb-2 font-serif">Your Move</h2>
                   <p className="text-editorial-muted text-sm">Find the best move for {orientation}.</p>
                </div>
            )}
            {status === "solved" && (
                <div>
                   <h2 className="text-2xl font-black uppercase text-green-600 mb-2 font-serif">Puzzle Solved!</h2>
                   <p className="text-editorial-muted text-sm">Outstanding vision. Come back tomorrow for a new challenge.</p>
                </div>
            )}
            {status === "failed" && (
                <div>
                   <h2 className="text-2xl font-black uppercase text-red-600 mb-2 font-serif">Incorrect</h2>
                   <p className="text-editorial-muted text-sm">{errorMsg}</p>
                   <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 border border-editorial-border text-xs uppercase tracking-widest hover:bg-gray-50 transition-colors">
                     Retry Puzzle
                   </button>
                </div>
            )}
         </div>
      </div>
    </div>
  );
}
