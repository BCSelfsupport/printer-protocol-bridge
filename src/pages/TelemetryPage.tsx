import { useNavigate } from 'react-router-dom';
import { TelemetryScreen } from '@/components/screens/TelemetryScreen';

const TelemetryPage = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh h-dvh overflow-hidden flex flex-col bg-background">
      <TelemetryScreen onHome={() => navigate('/')} />
    </div>
  );
};

export default TelemetryPage;
