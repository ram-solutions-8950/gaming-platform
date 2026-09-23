interface PotDisplayProps {
  pot: number;
}

export function PotDisplay({ pot }: PotDisplayProps) {
  return (
    <div className="pot" aria-label={`Pot ${(pot / 100).toFixed(2)} rupees`}>
      <span className="pot-chip" aria-hidden="true" />
      <span className="pot-word">Pot</span>
      <span className="pot-amount">₹{(pot / 100).toFixed(2)}</span>
    </div>
  );
}
