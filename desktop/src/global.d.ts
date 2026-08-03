export {};

declare global {
  interface Window {
    prismWindow?: {
      startDrag: (x: number, y: number) => void;
      moveDrag: (x: number, y: number) => void;
      endDrag: () => void;
    };
  }
}
