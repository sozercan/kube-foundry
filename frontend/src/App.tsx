import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { ModelsPage } from './pages/ModelsPage'
import { DeployPage } from './pages/DeployPage'
import { DeploymentsPage } from './pages/DeploymentsPage'
import { DeploymentDetailsPage } from './pages/DeploymentDetailsPage'
import { SettingsPage } from './pages/SettingsPage'
import { InstallationPage } from './pages/InstallationPage'
import { Toaster } from './components/ui/toaster'

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<ModelsPage />} />
          <Route path="/deploy/:modelId" element={<DeployPage />} />
          <Route path="/deployments" element={<DeploymentsPage />} />
          <Route path="/deployments/:name" element={<DeploymentDetailsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/installation" element={<InstallationPage />} />
        </Routes>
      </MainLayout>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
