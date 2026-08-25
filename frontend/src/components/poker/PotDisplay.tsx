interface PotDisplayProps {
  pot: number;
}

export function PotDisplay({ pot }: PotDisplayProps) {
  return (
    <div className="pot-display-pill">
      <span className="pot-label">POT</span>
      <span className="pot-amount">₹{(pot / 100).toFixed(2)}</span>
    </div>
  );
}
