import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AssessmentPage } from './pages/AssessmentPage';
import { AutoAnalysisPage } from './pages/AutoAnalysisPage';
import { BBSLiveAssessment } from './pages/BBSLiveAssessment';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/assessment/:id" element={<AssessmentPage />} />
        <Route path="/auto-analysis" element={<AutoAnalysisPage />} />
        <Route path="/live-assessment" element={<BBSLiveAssessment />} />
        <Route path="/bbs-assessment" element={<BBSLiveAssessment />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
