import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AssessmentPage } from './pages/AssessmentPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/assessment/:id" element={<AssessmentPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
