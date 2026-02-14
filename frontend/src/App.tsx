import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AssessmentPage } from './pages/AssessmentPage';
import { AutoAnalysisPage } from './pages/AutoAnalysisPage';
import { CameraAssessmentPage } from './pages/CameraAssessmentPage';
import { BBSAssessmentPage } from './pages/BBSAssessmentPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/assessment/:id" element={<AssessmentPage />} />
        <Route path="/auto-analysis" element={<AutoAnalysisPage />} />
        <Route path="/camera-assessment" element={<CameraAssessmentPage />} />
        <Route path="/bbs-assessment" element={<BBSAssessmentPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
