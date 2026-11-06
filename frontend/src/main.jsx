import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = 'http://localhost:5000/api';
const SERVER_URL = 'http://localhost:5000';

function App() {
  const [page, setPage] = useState('dashboard');

  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('rembrandtsUser');
      const token = localStorage.getItem('rembrandtsToken');

      if (!savedUser || !token) return null;
      return JSON.parse(savedUser);
    } catch {
      return null;
    }
  });

 const [authPage, setAuthPage] = useState(() => {
  const token = new URLSearchParams(window.location.search).get('token');

  return window.location.pathname === '/reset-password' && token
    ? 'reset'
    : 'login';
});
const [forgotEmail, setForgotEmail] = useState('');
const [loading, setLoading] = useState(false);
const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '' });
 const [resetToken, setResetToken] = useState(
  () => new URLSearchParams(window.location.search).get('token') || ''
);
const [newPassword, setNewPassword] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');

  // New: confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // New: loading state for individual actions
  const [actionLoading, setActionLoading] = useState('');

  // New: appointment filters
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState('All');

  // New: project and payment searches
  const [projectSearch, setProjectSearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');

  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  });

  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    password: ''
  });

  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [payments, setPayments] = useState([]);

  const [form, setForm] = useState({
    name: '',
    contact: '',
    tattoo: '',
    date: '',
    time: '',
    notes: '',
    customer_id: null
  });

  const [designImage, setDesignImage] = useState(null);
  const [designImagePreview, setDesignImagePreview] = useState('');

  const [customerForm, setCustomerForm] = useState({
    name: '',
    contact_number: '',
    email: ''
  });

  const [projectForm, setProjectForm] = useState({
    customer_id: '',
    design_details: '',
    total_price: '',
    status: 'Planned',
    progress: 0,
    notes: ''
  });

  const [editingProjectId, setEditingProjectId] = useState(null);

  const [projectEditForm, setProjectEditForm] = useState({
    customer_id: '',
    design_details: '',
    total_price: '',
    status: 'Planned',
    progress: 0,
    notes: ''
  });

  const [paymentForm, setPaymentForm] = useState({
    project_id: '',
    amount: '',
    payment_method: 'Cash',
    payment_type: 'Downpayment',
    notes: ''
  });

  const [search, setSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerModal, setCustomerModal] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [customerEditForm, setCustomerEditForm] = useState({
    name: '',
    contact_number: '',
    email: ''
  });

  const customersPerPage = 5;
  const isAdmin = user?.role === 'Admin';

  // =========================
  // HELPER FUNCTIONS
  // =========================

  function showSuccess(message) {
    setToast({ show: true, message });

    setTimeout(() => {
      setToast({ show: false, message: '' });
    }, 3000);
  }

  function showError(message) {
    setToast({ show: true, message: `Error: ${message}` });

    setTimeout(() => {
      setToast({ show: false, message: '' });
    }, 4000);
  }

  function askConfirmation(title, message, action, confirmText = 'Confirm') {
    setConfirmDialog({
      title,
      message,
      action,
      confirmText
    });
  }

  async function handleConfirmation() {
    if (!confirmDialog || confirmLoading) return;

    setConfirmLoading(true);

    try {
      await confirmDialog.action();
      setConfirmDialog(null);
    } catch (error) {
      showError(error.message || 'The action could not be completed.');
    } finally {
      setConfirmLoading(false);
    }
  }

  function getDateString(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  function formatDate(value) {
    const dateString = getDateString(value);
    const parts = dateString.split('-');

    if (parts.length !== 3 || parts[0].length !== 4) {
      return value || '-';
    }

    const [year, month, day] = parts;
    return `${month}/${day}/${year}`;
  }

  function formatTime(value) {
    if (!value) return '-';

    const match = String(value).match(/^(\d{1,2}):(\d{2})/);
    if (!match) return String(value);

    let hours = Number(match[1]);
    const minutes = match[2];
    const suffix = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12 || 12;

    return `${hours}:${minutes} ${suffix}`;
  }

  function peso(value) {
    return Number(value || 0).toLocaleString('en-PH', {
      style: 'currency',
      currency: 'PHP'
    });
  }

  function getCustomerName(customerId) {
    const customer = customers.find(
      c => String(c.id) === String(customerId)
    );

    return customer?.name || 'Customer';
  }

  function getProjectName(projectId) {
    const project = projects.find(
      p => String(p.id) === String(projectId)
    );

    return project?.design_details || 'Tattoo Project';
  }

  function getProjectTotalPaid(projectId) {
    const project = projects.find(
      p => String(p.id) === String(projectId)
    );

    return Number(project?.total_paid || 0);
  }

  function getProjectBalance(projectId) {
    const project = projects.find(
      p => String(p.id) === String(projectId)
    );

    if (!project) return 0;
    return Number(project.remaining_balance || 0);
  }

  async function readResponse(response, fallbackMessage) {
    let data = {};

    try {
      data = await response.json();
    } catch {
      // The server may return an empty response.
    }

    if (!response.ok) {
      throw new Error(
        data.error || data.message || fallbackMessage
      );
    }

    return data;
  }

  async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('rembrandtsToken');

    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    return fetch(url, {
      ...options,
      headers
    });
  }

  function handleDesignImage(e) {
    const file = e.target.files?.[0];

    if (!file) {
      setDesignImage(null);
      setDesignImagePreview('');
      return;
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      alert('JPG, PNG, or WEBP images only.');
      e.target.value = '';
      setDesignImage(null);
      setDesignImagePreview('');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must not exceed 5 MB.');
      e.target.value = '';
      setDesignImage(null);
      setDesignImagePreview('');
      return;
    }

    if (designImagePreview) {
      URL.revokeObjectURL(designImagePreview);
    }

    setDesignImage(file);
    setDesignImagePreview(URL.createObjectURL(file));
  }

  function removeDesignImage() {
    if (designImagePreview) {
      URL.revokeObjectURL(designImagePreview);
    }

    setDesignImage(null);
    setDesignImagePreview('');

    const fileInput = document.getElementById('design-image-input');

    if (fileInput) {
      fileInput.value = '';
    }
  }

  // =========================
  // LOAD DATA AFTER LOGIN
  // =========================

  useEffect(() => {
    if (!user) return;

    setForm(previous => ({
      ...previous,
      name: user.role === 'Customer' ? user.name || '' : ''
    }));

    setPage(user.role === 'Customer' ? 'appointments' : 'dashboard');

    loadAll();
  }, [user]);

  // =========================
  // LOGIN
  // =========================

  async function login(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });

      const data = await readResponse(response, 'Login failed.');

      if (!data.user || !data.token) {
        throw new Error(
          'Hindi nakuha ang user information o authentication token mula sa server.'
        );
      }

      localStorage.setItem('rembrandtsToken', data.token);
      localStorage.setItem('rembrandtsUser', JSON.stringify(data.user));

      setUser(data.user);
      setLoginForm({ email: '', password: '' });
      setPage(data.user.role === 'Admin' ? 'dashboard' : 'appointments');

      showSuccess('Login successful!');
    } catch (error) {
      showError(error.message || 'Unable to log in.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }
  async function requestPasswordReset(e) {
  e.preventDefault();
  setLoading(true);

  try {
    const response = await fetch(`${API}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: forgotEmail })
    });

    const data = await readResponse(
      response,
      'Unable to send password reset link.'
    );

    showSuccess(
      data.message || 'Please check your email for the password reset link.'
    );

    setForgotEmail('');
  } catch (error) {
    showError(error.message || 'Unable to send reset link.');
    console.error(error);
  } finally {
    setLoading(false);
  }
}
// =========================
// RESET PASSWORD
// =========================

async function resetPassword(e) {
  e.preventDefault();

  if (newPassword !== confirmPassword) {
    showError('Passwords do not match.');
    return;
  }

  if (newPassword.length < 6) {
    showError('Password must be at least 6 characters.');
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(`${API}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetToken,
        newPassword
      })
    });

    const data = await readResponse(
      response,
      'Unable to reset password.'
    );

    showSuccess(data.message || 'Password reset successful!');

    setNewPassword('');
    setConfirmPassword('');
    setResetToken('');
    setAuthPage('login');
    window.history.replaceState({}, '', '/');
  } catch (error) {
    showError(error.message || 'Unable to reset password.');
    console.error(error);
  } finally {
    setLoading(false);
  }
}

  // =========================
  // REGISTER CUSTOMER
  // =========================

  async function register(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${API}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm)
      });

      await readResponse(response, 'Registration failed.');

      showSuccess('Registration successful! You can now log in.');

      setRegisterForm({
        name: '',
        email: '',
        password: ''
      });

      setAuthPage('login');
    } catch (error) {
      showError(error.message || 'Unable to register.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // LOGOUT
  // =========================

  function logout() {
    askConfirmation(
      'Confirm Logout',
      'Are you sure you want to log out of the system?',
      async () => {
        localStorage.removeItem('rembrandtsUser');
        localStorage.removeItem('rembrandtsToken');

        setUser(null);
        setPage('dashboard');
        setAppointments([]);
        setCustomers([]);
        setProjects([]);
        setPayments([]);
        setAuthPage('login');

        showSuccess('You have successfully logged out.');
      },
      'Logout'
    );
  }

  // =========================
  // LOAD SYSTEM DATA
  // =========================

  async function loadAll() {
    if (!user) return;

    try {
      if (user.role === 'Customer') {
        const response = await apiFetch(`${API}/appointments`);

        const data = await readResponse(
          response,
          'Failed to load your appointments.'
        );

        setAppointments(Array.isArray(data) ? data : []);
        setCustomers([]);
        setProjects([]);
        setPayments([]);

        return;
      }

      const responses = await Promise.all([
        apiFetch(`${API}/appointments`),
        apiFetch(`${API}/customers`),
        apiFetch(`${API}/projects`),
        apiFetch(`${API}/payments`)
      ]);

      const names = [
        'appointments',
        'customers',
        'projects',
        'payments'
      ];

      const data = await Promise.all(
        responses.map((response, index) =>
          readResponse(response, `Failed to load ${names[index]}.`)
        )
      );

      setAppointments(Array.isArray(data[0]) ? data[0] : []);
      setCustomers(Array.isArray(data[1]) ? data[1] : []);
      setProjects(Array.isArray(data[2]) ? data[2] : []);
      setPayments(Array.isArray(data[3]) ? data[3] : []);
    } catch (error) {
      console.error(error);

      if (
        error.message?.toLowerCase().includes('token') ||
        error.message?.toLowerCase().includes('unauthorized')
      ) {
        alert('Your session has expired. Please log in again.');

        localStorage.removeItem('rembrandtsUser');
        localStorage.removeItem('rembrandtsToken');
        setUser(null);
        setAuthPage('login');

        return;
      }

      showError(
        'Unable to connect to the backend. Make sure the backend and MySQL are running.'
      );
    }
  }

  async function refreshData() {
    setRefreshing(true);

    try {
      await loadAll();
      showSuccess('Data refreshed successfully.');
    } finally {
      setRefreshing(false);
    }
  }

  // =========================
  // BOOK APPOINTMENT
  // =========================

  async function book(e) {
    e.preventDefault();

    if (!user) return;

    setLoading(true);

    try {
      const formData = new FormData();

      formData.append('customer_id', form.customer_id || '');
      formData.append('name', form.name.trim());
      formData.append('contact', form.contact.trim());
      formData.append('tattoo', form.tattoo.trim());
      formData.append('appointment_date', form.date);
      formData.append('appointment_time', form.time);
      formData.append('notes', form.notes.trim());

      if (designImage) {
        formData.append('design_image', designImage);
      }

      const response = await apiFetch(`${API}/appointments`, {
        method: 'POST',
        body: formData
      });

      await readResponse(response, 'Appointment submission failed.');
      await loadAll();

      removeDesignImage();

      setForm({
        name: user.role === 'Customer' ? user.name || '' : '',
        contact: '',
        tattoo: '',
        date: '',
        time: '',
        notes: '',
        customer_id: null
      });

      showSuccess('Appointment request submitted!');
      setPage('appointments');
    } catch (error) {
      showError(error.message || 'The appointment was not saved.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // UPDATE APPOINTMENT STATUS
  // =========================

  async function updateAppointmentStatus(id, status) {
    if (!isAdmin) {
      showError('Only admins can update the appointment status.');
      return;
    }

    setActionLoading(`appointment-${id}`);

    try {
      const response = await apiFetch(
        `${API}/appointments/${id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        }
      );

      await readResponse(response, 'Status update failed.');
      await loadAll();

      showSuccess(`Appointment ${status.toLowerCase()} successfully.`);
    } catch (error) {
      showError(error.message || 'Unable to update the appointment.');
      console.error(error);
    } finally {
      setActionLoading('');
    }
  }

  // =========================
  // CUSTOMER RECORDS
  // =========================

  async function addCustomer(e) {
    e.preventDefault();

    if (!isAdmin) return;

    if (!customerForm.name.trim()) {
      alert('Please enter customer name.');
      return;
    }

    if (!customerForm.contact_number.trim()) {
      alert('Please enter contact number.');
      return;
    }

    setActionLoading('add-customer');

    try {
      const response = await apiFetch(`${API}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customerForm.name.trim(),
          contact_number: customerForm.contact_number.trim(),
          email: customerForm.email.trim() || null
        })
      });

      await readResponse(response, 'Customer could not be saved.');
      await loadAll();

      setCustomerForm({
        name: '',
        contact_number: '',
        email: ''
      });

      showSuccess('Customer added successfully!');
    } catch (error) {
      showError(error.message || 'The customer was not saved.');
      console.error(error);
    } finally {
      setActionLoading('');
    }
  }

  function openCustomerDetails(customer) {
    setSelectedCustomer(customer);
    setCustomerModal('view');
  }

  function openEditCustomer(customer) {
    setSelectedCustomer(customer);

    setCustomerEditForm({
      name: customer.name || '',
      contact_number: customer.contact_number || '',
      email: customer.email || ''
    });

    setCustomerModal('edit');
  }

  async function updateCustomer(e) {
    e.preventDefault();

    if (!isAdmin || !selectedCustomer) return;

    if (!customerEditForm.name.trim()) {
      alert('Please enter customer name.');
      return;
    }

    if (!customerEditForm.contact_number.trim()) {
      alert('Please enter contact number.');
      return;
    }

    setActionLoading('update-customer');

    try {
      const response = await apiFetch(
        `${API}/customers/${selectedCustomer.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: customerEditForm.name.trim(),
            contact_number: customerEditForm.contact_number.trim(),
            email: customerEditForm.email.trim() || null
          })
        }
      );

      await readResponse(response, 'Customer update failed.');
      await loadAll();

      setCustomerModal(null);
      setSelectedCustomer(null);

      showSuccess('Customer updated successfully!');
    } catch (error) {
      showError(error.message || 'Unable to update the customer.');
      console.error(error);
    } finally {
      setActionLoading('');
    }
  }

  async function performDeleteCustomer(customer) {
    setActionLoading(`delete-customer-${customer.id}`);

    try {
      const response = await apiFetch(
        `${API}/customers/${customer.id}`,
        { method: 'DELETE' }
      );

      await readResponse(response, 'Customer deletion failed.');
      await loadAll();

      setCustomerModal(null);
      setSelectedCustomer(null);

      showSuccess('Customer deleted successfully!');
    } finally {
      setActionLoading('');
    }
  }

  function deleteCustomer(customer) {
    if (!isAdmin) return;

    askConfirmation(
      'Delete Customer',
      `Are you sure you want to delete ${customer.name}? This action cannot be undone.`,
      () => performDeleteCustomer(customer),
      'Delete'
    );
  }

  // =========================
  // ADD TATTOO PROJECT
  // =========================

  async function addProject(e) {
    e.preventDefault();

    if (!isAdmin) return;

    const price = Number(projectForm.total_price);
    const progress = Number(projectForm.progress);

    if (!projectForm.customer_id) {
      alert('Please select a customer first.');
      return;
    }

    if (!projectForm.design_details.trim()) {
      alert('Please enter the tattoo design.');
      return;
    }

    if (
      projectForm.total_price === '' ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      alert('Please enter a valid total tattoo price.');
      return;
    }

    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      alert('The project progress must be between 0 and 100 only.');
      return;
    }

    const finalProgress =
      projectForm.status === 'Completed' ? 100 : progress;

    setActionLoading('add-project');

    try {
      const response = await apiFetch(`${API}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: Number(projectForm.customer_id),
          design_details: projectForm.design_details.trim(),
          total_price: price,
          status: projectForm.status,
          progress: finalProgress,
          notes: projectForm.notes.trim()
        })
      });

      await readResponse(response, 'Project could not be saved.');
      await loadAll();

      setProjectForm({
        customer_id: '',
        design_details: '',
        total_price: '',
        status: 'Planned',
        progress: 0,
        notes: ''
      });

      showSuccess('Tattoo project added!');
    } catch (error) {
      showError(error.message || 'The project was not saved.');
      console.error(error);
    } finally {
      setActionLoading('');
    }
  }

  function startEditProject(project) {
    setEditingProjectId(project.id);

    setProjectEditForm({
      customer_id: String(project.customer_id || ''),
      design_details: project.design_details || '',
      total_price: String(project.total_price ?? ''),
      status: project.status || 'Planned',
      progress: Number(project.progress) || 0,
      notes: project.notes || ''
    });
  }

  function cancelEditProject() {
    setEditingProjectId(null);

    setProjectEditForm({
      customer_id: '',
      design_details: '',
      total_price: '',
      status: 'Planned',
      progress: 0,
      notes: ''
    });
  }

  async function updateProject(e) {
    e.preventDefault();

    if (!isAdmin || !editingProjectId) return;

    const price = Number(projectEditForm.total_price);
    const progress = Number(projectEditForm.progress);

    if (
      !projectEditForm.customer_id ||
      !projectEditForm.design_details.trim()
    ) {
      alert('Please select a customer and enter the tattoo design.');
      return;
    }

    if (
      projectEditForm.total_price === '' ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      alert('Please enter a valid total tattoo price.');
      return;
    }

    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      alert('Project progress must be between 0 and 100 only.');
      return;
    }

    const finalProgress =
      projectEditForm.status === 'Completed' ? 100 : progress;

    setActionLoading('update-project');

    try {
      const response = await apiFetch(
        `${API}/projects/${editingProjectId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: Number(projectEditForm.customer_id),
            design_details: projectEditForm.design_details.trim(),
            total_price: price,
            status: projectEditForm.status,
            progress: finalProgress,
            notes: projectEditForm.notes.trim()
          })
        }
      );

      await readResponse(response, 'Project update failed.');
      await loadAll();
      cancelEditProject();

      showSuccess('Project updated successfully!');
    } catch (error) {
      showError(error.message || 'Unable to update the project.');
      console.error(error);
    } finally {
      setActionLoading('');
    }
  }

  async function performDeleteProject(project) {
    setActionLoading(`delete-project-${project.id}`);

    try {
      const response = await apiFetch(
        `${API}/projects/${project.id}`,
        { method: 'DELETE' }
      );

      await readResponse(response, 'Project deletion failed.');
      await loadAll();

      if (String(editingProjectId) === String(project.id)) {
        cancelEditProject();
      }

      showSuccess('Project deleted successfully!');
    } finally {
      setActionLoading('');
    }
  }

  function deleteProject(project) {
    if (!isAdmin) return;

    askConfirmation(
      'Delete Tattoo Project',
      `Are you sure you want to delete "${project.design_details || 'Tattoo Project'}"? This action cannot be undone.`,
      () => performDeleteProject(project),
      'Delete'
    );
  }

  // =========================
  // ADD PAYMENT RECORD
  // =========================

  async function addPayment(e) {
    e.preventDefault();

    if (!isAdmin) return;

    const amount = Number(paymentForm.amount);

    const selectedProject = projects.find(
      p => String(p.id) === String(paymentForm.project_id)
    );

    if (!selectedProject) {
      alert('Please select a tattoo project first.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid payment amount greater than zero.');
      return;
    }

    if (amount > Number(selectedProject.remaining_balance || 0)) {
      alert(
        `The payment exceeds the remaining balance ${peso(selectedProject.remaining_balance)}.`
      );
      return;
    }

    setActionLoading('add-payment');

    try {
      const response = await apiFetch(`${API}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: Number(paymentForm.project_id),
          customer_id: Number(selectedProject.customer_id),
          amount,
          payment_method: paymentForm.payment_method,
          payment_type: paymentForm.payment_type,
          notes: paymentForm.notes.trim()
        })
      });

      await readResponse(response, 'Payment could not be saved.');
      await loadAll();

      setPaymentForm({
        project_id: '',
        amount: '',
        payment_method: 'Cash',
        payment_type: 'Downpayment',
        notes: ''
      });

      showSuccess('Payment recorded!');
    } catch (error) {
      showError(error.message || 'The payment was not saved.');
      console.error(error);
    } finally {
      setActionLoading('');
    }
  }

  // =========================
  // AUTHENTICATION PAGES
  // =========================

  if (!user) {
    return (
      <div className="app auth-app">
        {toast.show && (
          <div className="success-toast">
            <div className="success-toast-icon">✓</div>
            <div>
              <strong>Notification</strong>
              <p>{toast.message}</p>
            </div>
          </div>
        )}

        <header className="topbar">
          <div>
            <h1>Rembrandts Tattoo</h1>
            <p>Appointment and Project Management System</p>
          </div>
        </header>

        <main className="auth-content">
 {authPage === 'reset' ? (
  <section className="panel auth-panel">
    <div className="page-title">
      <h2>Reset Password</h2>
      <p>Enter your new password below.</p>
    </div>

    <form onSubmit={resetPassword} className="form-grid">
      <label className="full">
        New Password
        <input
          type="password"
          required
          minLength="6"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
        />
      </label>

      <label className="full">
        Confirm New Password
        <input
          type="password"
          required
          minLength="6"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
        />
      </label>

      <div className="actions full">
        <button className="primary" disabled={loading}>
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </form>
  </section>
) : authPage === 'forgot' ? (
  <section className="panel auth-panel">
    <div className="page-title">
      <h2>Forgot Password</h2>
      <p>Enter your registered email to receive a reset link.</p>
    </div>

    <form onSubmit={requestPasswordReset} className="form-grid">
      <label className="full">
        Registered Email
        <input
          type="email"
          required
          value={forgotEmail}
          onChange={e => setForgotEmail(e.target.value)}
        />
      </label>

      <div className="actions full">
        <button className="primary" disabled={loading}>
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </div>
    </form>

    <div className="auth-switch">
      <button
        type="button"
        onClick={() => setAuthPage('login')}
      >
        Back to Login
      </button>
    </div>
  </section>
) : authPage === 'login' ? (
            <section className="panel auth-panel">
              <div className="page-title">
                <h2>Welcome Back</h2>
                <p>Login to access the Rembrandts Tattoo system.</p>
              </div>

              <form onSubmit={login} className="form-grid">
                <label className="full">
                  Email
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={loginForm.email}
                    onChange={e =>
                      setLoginForm({
                        ...loginForm,
                        email: e.target.value
                      })
                    }
                  />
                </label>

                <label className="full">
                  Password
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={loginForm.password}
                    onChange={e =>
                      setLoginForm({
                        ...loginForm,
                        password: e.target.value
                      })
                    }
                  />
                </label>

                <div className="actions full">
                  <button className="primary" disabled={loading}>
                    {loading ? 'Please wait...' : 'Login'}
                  </button>
                </div>
              </form>

              <div className="auth-switch">
  <button
    type="button"
    onClick={() => setAuthPage('forgot')}
  >
    Forgot Password?
  </button>

  <p>Don't have an account?</p>
  <button
    type="button"
    onClick={() => setAuthPage('register')}
  >
    Create Account
  </button>
</div>
            </section>
          ) : (
            <section className="panel auth-panel">
              <div className="page-title">
                <h2>Create Account</h2>
                <p>Register as a customer.</p>
              </div>

              <form onSubmit={register} className="form-grid">
                <label className="full">
                  Full Name
                  <input
                    required
                    autoComplete="name"
                    value={registerForm.name}
                    onChange={e =>
                      setRegisterForm({
                        ...registerForm,
                        name: e.target.value
                      })
                    }
                  />
                </label>

                <label className="full">
                  Email
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={registerForm.email}
                    onChange={e =>
                      setRegisterForm({
                        ...registerForm,
                        email: e.target.value
                      })
                    }
                  />
                </label>

                <label className="full">
                  Password
                  <input
                    type="password"
                    required
                    minLength="6"
                    autoComplete="new-password"
                    value={registerForm.password}
                    onChange={e =>
                      setRegisterForm({
                        ...registerForm,
                        password: e.target.value
                      })
                    }
                  />
                </label>

                <div className="actions full">
                  <button className="primary" disabled={loading}>
                    {loading ? 'Please wait...' : 'Register'}
                  </button>
                </div>
              </form>

              <div className="auth-switch">
                <p>Already have an account?</p>
                <button onClick={() => setAuthPage('login')}>
                  Back to Login
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    );
  }

  // =========================
  // DASHBOARD CALCULATIONS
  // =========================

  const today = new Date();

  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');

  const pending = appointments.filter(
    a => String(a.status || '').toLowerCase() === 'pending'
  ).length;

  const approved = appointments.filter(
    a => String(a.status || '').toLowerCase() === 'approved'
  ).length;

  const upcomingAppointments = appointments
    .filter(a => {
      const status = String(a.status || '').toLowerCase();
      const date = getDateString(a.appointment_date);

      return status === 'approved' && date >= todayString;
    })
    .sort((a, b) => {
      const dateA = `${getDateString(a.appointment_date)} ${a.appointment_time || ''}`;
      const dateB = `${getDateString(b.appointment_date)} ${b.appointment_time || ''}`;

      return dateA.localeCompare(dateB);
    });

  const ongoingProjects = projects.filter(p =>
    ['ongoing', 'in progress'].includes(
      String(p.status || '').toLowerCase()
    )
  ).length;

  const completedProjects = projects.filter(
    p => String(p.status || '').toLowerCase() === 'completed'
  ).length;

  const totalRecordedPayments = payments.reduce(
    (total, payment) => total + (Number(payment.amount) || 0),
    0
  );

  const totalProjectPrices = projects.reduce(
    (total, project) => total + (Number(project.total_price) || 0),
    0
  );

  const totalOutstandingBalance = projects.reduce(
    (total, project) => total + (Number(project.remaining_balance) || 0),
    0
  );

  const recentAppointments = [...appointments]
    .sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();

      if (dateA !== dateB) return dateB - dateA;

      return Number(b.id || 0) - Number(a.id || 0);
    })
    .slice(0, 5);

  const filteredCustomers = customers.filter(c =>
    `${c.name || ''} ${c.contact_number || ''} ${c.email || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const totalCustomerPages = Math.max(
    1,
    Math.ceil(filteredCustomers.length / customersPerPage)
  );

  const currentCustomerPage = Math.min(
    customerPage,
    totalCustomerPages
  );

  const startCustomerIndex =
    (currentCustomerPage - 1) * customersPerPage;

  const visibleCustomers = filteredCustomers.slice(
    startCustomerIndex,
    startCustomerIndex + customersPerPage
  );

  const customersWithEmail = customers.filter(
    c => c.email && c.email.trim() !== ''
  ).length;

  const customersWithAppointments = customers.filter(c =>
    appointments.some(
      a => String(a.customer_id) === String(c.id)
    )
  ).length;

  const selectedPaymentProject = projects.find(
    p => String(p.id) === String(paymentForm.project_id)
  );

  // New: filtered appointments
  const filteredAppointments = appointments.filter(a => {
    const customer = a.customer_name || a.name || '';
    const tattoo = a.tattoo_preference || a.tattoo || '';
    const contact = a.contact_number || a.contact || '';

    const matchesSearch =
      `${customer} ${tattoo} ${contact}`
        .toLowerCase()
        .includes(appointmentSearch.toLowerCase());

    const matchesStatus =
      appointmentStatusFilter === 'All' ||
      String(a.status || 'Pending').toLowerCase() ===
        appointmentStatusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // New: filtered projects
  const filteredProjects = projects.filter(p => {
    const customer = getCustomerName(p.customer_id);

    return `${customer} ${p.design_details || ''} ${p.status || ''}`
      .toLowerCase()
      .includes(projectSearch.toLowerCase());
  });

  // New: filtered payments
  const filteredPayments = payments.filter(p => {
    const customer =
      p.customer_name || getCustomerName(p.customer_id);
    const project =
      p.project_name || getProjectName(p.project_id);

    return `${customer} ${project} ${p.payment_method || ''} ${p.payment_type || ''}`
      .toLowerCase()
      .includes(paymentSearch.toLowerCase());
  });

  // =========================
  // MAIN SYSTEM
  // =========================

  return (
    <div className="app">
      {toast.show && (
        <div className="success-toast">
          <div className="success-toast-icon">✓</div>
          <div>
            <strong>Notification</strong>
            <p>{toast.message}</p>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmDialog && (
        <div
          className="modal-overlay"
          style={{ zIndex: 10000 }}
          onClick={() => {
            if (!confirmLoading) setConfirmDialog(null);
          }}
        >
          <div
            className="modal confirmation-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '420px', width: '95%' }}
          >
            <div className="modal-header">
              <div>
                <h2>{confirmDialog.title}</h2>
                <p>{confirmDialog.message}</p>
              </div>

              <button
                type="button"
                className="modal-close"
                disabled={confirmLoading}
                onClick={() => setConfirmDialog(null)}
              >
                ×
              </button>
            </div>

            <div className="actions">
              <button
                type="button"
                disabled={confirmLoading}
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary"
                disabled={confirmLoading}
                onClick={handleConfirmation}
              >
                {confirmLoading ? 'Please wait...' : confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="topbar">
        <div>
          <h1>Rembrandts Tattoo</h1>
          <p>Appointment and Project Management System</p>
        </div>

        <div className="topbar-user">
          <span className="role">
            {user.name} ({user.role})
          </span>

          <button className="logout-button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          {isAdmin && (
            <>
              <button
                className={`nav ${page === 'dashboard' ? 'active' : ''}`}
                onClick={() => setPage('dashboard')}
              >
                Dashboard
              </button>

              <button
                className={`nav ${page === 'appointments' ? 'active' : ''}`}
                onClick={() => setPage('appointments')}
              >
                Appointments
                {pending > 0 && (
                  <span className="nav-count">{pending}</span>
                )}
              </button>

              <button
                className={`nav ${page === 'customers' ? 'active' : ''}`}
                onClick={() => {
                  setPage('customers');
                  setCustomerPage(1);
                }}
              >
                Customers
              </button>

              <button
                className={`nav ${page === 'projects' ? 'active' : ''}`}
                onClick={() => setPage('projects')}
              >
                Tattoo Projects
              </button>

              <button
                className={`nav ${page === 'payments' ? 'active' : ''}`}
                onClick={() => setPage('payments')}
              >
                Payments
              </button>

              <button
                className={`nav ${page === 'reports' ? 'active' : ''}`}
                onClick={() => setPage('reports')}
              >
                Reports
              </button>
            </>
          )}

          {!isAdmin && (
            <button
              className={`nav ${page === 'appointments' ? 'active' : ''}`}
              onClick={() => setPage('appointments')}
            >
              My Appointments
            </button>
          )}

          <button
            className={`nav book-nav ${page === 'book' ? 'active' : ''}`}
            onClick={() => setPage('book')}
          >
            + Book Appointment
          </button>

          {isAdmin && (
            <div className="sidebar-note">
              <span className="sidebar-note-label">SYSTEM</span>
              <p>
                Manage your appointments, customers, tattoo projects, and
                payments in one place.
              </p>
            </div>
          )}
        </aside>

        <main className="content">
          {/* DASHBOARD */}
          {page === 'dashboard' && isAdmin && (
            <>
              <div className="page-title dashboard-heading">
                <div>
                  <h2>Dashboard</h2>
                  <p>Overview of Rembrandts Tattoo operations.</p>
                </div>

                <button
                  className="refresh-button"
                  onClick={refreshData}
                  disabled={refreshing}
                >
                  {refreshing ? 'Refreshing...' : '↻ Refresh Data'}
                </button>
              </div>

              <div className="stats">
                <div className="stat stat-pending">
                  <div className="stat-top">
                    <span>Pending Appointments</span>
                    <span className="stat-icon">◷</span>
                  </div>
                  <b>{pending}</b>
                  <small>Awaiting your decision</small>
                </div>

                <div className="stat stat-upcoming">
                  <div className="stat-top">
                    <span>Upcoming Appointments</span>
                    <span className="stat-icon">▦</span>
                  </div>
                  <b>{upcomingAppointments.length}</b>
                  <small>Approved future bookings</small>
                </div>

                <div className="stat stat-ongoing">
                  <div className="stat-top">
                    <span>Ongoing Projects</span>
                    <span className="stat-icon">✎</span>
                  </div>
                  <b>{ongoingProjects}</b>
                  <small>Currently in progress</small>
                </div>

                <div className="stat stat-completed">
                  <div className="stat-top">
                    <span>Completed Projects</span>
                    <span className="stat-icon">✓</span>
                  </div>
                  <b>{completedProjects}</b>
                  <small>Finished tattoo projects</small>
                </div>

                <div className="stat stat-records">
                  <div className="stat-top">
                    <span>Payment Records</span>
                    <span className="stat-icon">₱</span>
                  </div>
                  <b>{payments.length}</b>
                  <small>Recorded transactions</small>
                </div>

                <div className="stat stat-total">
                  <div className="stat-top">
                    <span>Total Recorded Payments</span>
                    <span className="stat-icon">₱</span>
                  </div>
                  <b className="money-value">
                    {peso(totalRecordedPayments)}
                  </b>
                  <small>Sum of recorded payment amounts</small>
                </div>
              </div>

              <div className="payment-summary">
                <div>
                  <span>Total Project Prices</span>
                  <b>{peso(totalProjectPrices)}</b>
                </div>

                <div>
                  <span>Total Outstanding Balance</span>
                  <b>{peso(totalOutstandingBalance)}</b>
                </div>
              </div>

              <section className="panel dashboard-panel">
                <div className="section-head">
                  <div>
                    <h2>Upcoming Appointments</h2>
                    <p>Approved appointments scheduled for today or later.</p>
                  </div>

                  <button onClick={() => setPage('appointments')}>
                    View All
                  </button>
                </div>

                {upcomingAppointments.length > 0 ? (
                  <AppointmentTable
                    appointments={upcomingAppointments.slice(0, 5)}
                    onStatus={updateAppointmentStatus}
                    canManage
                    formatDate={formatDate}
                    formatTime={formatTime}
                    actionLoading={actionLoading}
                  />
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">▦</div>
                    <h3>No upcoming appointments</h3>
                    <p>Approved future appointments will appear here.</p>
                  </div>
                )}
              </section>

              <section className="panel dashboard-panel">
                <div className="section-head">
                  <div>
                    <h2>Recent Appointments</h2>
                    <p>The latest appointment requests in the system.</p>
                  </div>

                  <button onClick={() => setPage('appointments')}>
                    Manage Appointments
                  </button>
                </div>

                <AppointmentTable
                  appointments={recentAppointments}
                  onStatus={updateAppointmentStatus}
                  canManage
                  formatDate={formatDate}
                  formatTime={formatTime}
                  actionLoading={actionLoading}
                />
              </section>
            </>
          )}

          {/* BOOK APPOINTMENT */}
          {page === 'book' && (
            <section className="panel form-panel">
              <div className="page-title">
                <h2>Book an Appointment</h2>
                <p>
                  Enter your details and preferred tattoo appointment schedule.
                </p>
              </div>

              <form onSubmit={book} className="form-grid appointment-form">
                <label>
                  Customer Name
                  <input
                    required
                    value={form.name}
                    readOnly={user.role === 'Customer'}
                    onChange={e =>
                      setForm({ ...form, name: e.target.value })
                    }
                  />
                </label>

                <label>
                  Contact Number
                  <input
                    required
                    type="tel"
                    value={form.contact}
                    onChange={e =>
                      setForm({ ...form, contact: e.target.value })
                    }
                  />
                </label>

                <label className="full">
                  Tattoo Design / Preference
                  <textarea
                    required
                    placeholder="Describe the tattoo design, size, placement, or style you prefer."
                    value={form.tattoo}
                    onChange={e =>
                      setForm({ ...form, tattoo: e.target.value })
                    }
                  />
                </label>

                <label className="full">
                  Tattoo Reference Image (Optional)
                  <input
                    id="design-image-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleDesignImage}
                  />

                  <small>
                    Upload a JPG, PNG, or WEBP image. Maximum size: 5 MB.
                  </small>

                  {designImagePreview && (
                    <div className="design-image-preview">
                      <img
                        src={designImagePreview}
                        alt="Tattoo design preview"
                        style={{
                          width: '180px',
                          maxHeight: '180px',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          marginTop: '10px'
                        }}
                      />

                      <div>
                        <button
                          type="button"
                          onClick={removeDesignImage}
                        >
                          Remove Image
                        </button>
                      </div>
                    </div>
                  )}
                </label>

                <label>
                  Preferred Date
                  <input
                    type="date"
                    required
                    min={todayString}
                    value={form.date}
                    onChange={e =>
                      setForm({ ...form, date: e.target.value })
                    }
                  />
                </label>

                <label>
                  Preferred Time
                  <input
                    type="time"
                    required
                    value={form.time}
                    onChange={e =>
                      setForm({ ...form, time: e.target.value })
                    }
                  />
                </label>

                <label className="full">
                  Additional Notes
                  <textarea
                    placeholder="Optional details"
                    value={form.notes}
                    onChange={e =>
                      setForm({ ...form, notes: e.target.value })
                    }
                  />
                </label>

                <div className="actions full">
                  <button className="primary" disabled={loading}>
                    {loading ? 'Submitting...' : 'Submit Appointment'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPage(isAdmin ? 'dashboard' : 'appointments')
                    }
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* APPOINTMENTS */}
          {page === 'appointments' && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>{isAdmin ? 'Appointments' : 'My Appointments'}</h2>
                  <p>
                    {isAdmin
                      ? 'Review appointment requests and update their status.'
                      : 'View your appointment requests and their current status.'}
                  </p>
                </div>

                <button
                  className="primary"
                  onClick={() => setPage('book')}
                >
                  + New Appointment
                </button>
              </div>

              <div className="filter-toolbar">
                <input
                  type="search"
                  placeholder="Search"
                  value={appointmentSearch}
                  onChange={e => setAppointmentSearch(e.target.value)}
                />

                <select
                  value={appointmentStatusFilter}
                  onChange={e => setAppointmentStatusFilter(e.target.value)}
                >
                  <option value="All">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              <AppointmentTable
                appointments={filteredAppointments}
                onStatus={updateAppointmentStatus}
                canManage={isAdmin}
                formatDate={formatDate}
                formatTime={formatTime}
                actionLoading={actionLoading}
              />
            </section>
          )}

          {/* CUSTOMERS */}
          {page === 'customers' && isAdmin && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Customer Management</h2>
                  <p>Manage customer information and records.</p>
                </div>
              </div>

              <form onSubmit={addCustomer} className="form-grid compact">
                <label>
                  Customer Name
                  <input
                    required
                    value={customerForm.name}
                    onChange={e =>
                      setCustomerForm({
                        ...customerForm,
                        name: e.target.value
                      })
                    }
                    placeholder="Enter customer name"
                  />
                </label>

                <label>
                  Contact Number
                  <input
                    required
                    type="tel"
                    value={customerForm.contact_number}
                    onChange={e =>
                      setCustomerForm({
                        ...customerForm,
                        contact_number: e.target.value
                      })
                    }
                    placeholder="Enter contact number"
                  />
                </label>

                <label>
                  Email Address
                  <input
                    type="email"
                    value={customerForm.email}
                    onChange={e =>
                      setCustomerForm({
                        ...customerForm,
                        email: e.target.value
                      })
                    }
                    placeholder="Optional email address"
                  />
                </label>

                <div className="actions full">
                  <button
                    className="primary"
                    disabled={actionLoading === 'add-customer'}
                  >
                    {actionLoading === 'add-customer'
                      ? 'Adding Customer...'
                      : 'Add Customer'}
                  </button>
                </div>
              </form>

              <div className="customer-summary">
                <div>
                  <span>Total Customers</span>
                  <b>{customers.length}</b>
                </div>

                <div>
                  <span>With Email</span>
                  <b>{customersWithEmail}</b>
                </div>

                <div>
                  <span>With Appointments</span>
                  <b>{customersWithAppointments}</b>
                </div>
              </div>

              <div className="customer-toolbar">
                <h3>Customer List</h3>

                <input
                  type="search"
                  placeholder="Search customer..."
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setCustomerPage(1);
                  }}
                />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer Name</th>
                      <th>Contact Number</th>
                      <th>Email</th>
                      <th>Appointments</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleCustomers.map(customer => {
                      const appointmentCount = appointments.filter(
                        a => String(a.customer_id) === String(customer.id)
                      ).length;

                      return (
                        <tr key={customer.id}>
                          <td className="customer-cell">{customer.name}</td>
                          <td>{customer.contact_number || '-'}</td>
                          <td>{customer.email || '-'}</td>
                          <td>{appointmentCount}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="small"
                                onClick={() => openCustomerDetails(customer)}
                              >
                                View
                              </button>

                              <button
                                type="button"
                                className="small"
                                onClick={() => openEditCustomer(customer)}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="small customer-delete-button"
                                onClick={() => deleteCustomer(customer)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {!filteredCustomers.length && (
                      <tr>
                        <td colSpan="5" className="empty-cell">
                          No customers found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <span>
                  Showing {filteredCustomers.length
                    ? startCustomerIndex + 1
                    : 0}
                  {' - '}
                  {Math.min(
                    startCustomerIndex + customersPerPage,
                    filteredCustomers.length
                  )}
                  {' of '}
                  {filteredCustomers.length} customers
                </span>

                <div className="pagination-actions">
                  <button
                    type="button"
                    disabled={currentCustomerPage <= 1}
                    onClick={() => setCustomerPage(currentCustomerPage - 1)}
                  >
                    Previous
                  </button>

                  <span>
                    Page {currentCustomerPage} of {totalCustomerPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentCustomerPage >= totalCustomerPages}
                    onClick={() => setCustomerPage(currentCustomerPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>

              {customerModal === 'view' && selectedCustomer && (
                <div
                  className="modal-overlay"
                  onClick={() => setCustomerModal(null)}
                >
                  <div
                    className="modal"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="modal-header">
                      <div>
                        <h2>Customer Details</h2>
                        <p>View customer information.</p>
                      </div>

                      <button
                        type="button"
                        className="modal-close"
                        onClick={() => setCustomerModal(null)}
                      >
                        ×
                      </button>
                    </div>

                    <div className="customer-details">
                      <div>
                        <span>Customer Name</span>
                        <strong>{selectedCustomer.name}</strong>
                      </div>

                      <div>
                        <span>Contact Number</span>
                        <strong>{selectedCustomer.contact_number || '-'}</strong>
                      </div>

                      <div>
                        <span>Email Address</span>
                        <strong>{selectedCustomer.email || '-'}</strong>
                      </div>

                      <div>
                        <span>Total Appointments</span>
                        <strong>
                          {appointments.filter(
                            a => String(a.customer_id) === String(selectedCustomer.id)
                          ).length}
                        </strong>
                      </div>

                      <div>
                        <span>Total Tattoo Projects</span>
                        <strong>
                          {projects.filter(
                            p => String(p.customer_id) === String(selectedCustomer.id)
                          ).length}
                        </strong>
                      </div>
                    </div>

                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => setCustomerModal(null)}
                      >
                        Close
                      </button>

                      <button
                        type="button"
                        className="primary"
                        onClick={() => openEditCustomer(selectedCustomer)}
                      >
                        Edit Customer
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {customerModal === 'edit' && selectedCustomer && (
                <div
                  className="modal-overlay"
                  onClick={() => setCustomerModal(null)}
                >
                  <div
                    className="modal"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="modal-header">
                      <div>
                        <h2>Edit Customer</h2>
                        <p>Update customer information.</p>
                      </div>

                      <button
                        type="button"
                        className="modal-close"
                        onClick={() => setCustomerModal(null)}
                      >
                        ×
                      </button>
                    </div>

                    <form onSubmit={updateCustomer} className="form-grid">
                      <label className="full">
                        Customer Name
                        <input
                          required
                          value={customerEditForm.name}
                          onChange={e =>
                            setCustomerEditForm({
                              ...customerEditForm,
                              name: e.target.value
                            })
                          }
                        />
                      </label>

                      <label className="full">
                        Contact Number
                        <input
                          required
                          type="tel"
                          value={customerEditForm.contact_number}
                          onChange={e =>
                            setCustomerEditForm({
                              ...customerEditForm,
                              contact_number: e.target.value
                            })
                          }
                        />
                      </label>

                      <label className="full">
                        Email Address
                        <input
                          type="email"
                          value={customerEditForm.email}
                          onChange={e =>
                            setCustomerEditForm({
                              ...customerEditForm,
                              email: e.target.value
                            })
                          }
                        />
                      </label>

                      <div className="actions full">
                        <button
                          type="button"
                          onClick={() => setCustomerModal(null)}
                        >
                          Cancel
                        </button>

                        <button
                          className="primary"
                          type="submit"
                          disabled={actionLoading === 'update-customer'}
                        >
                          {actionLoading === 'update-customer'
                            ? 'Saving...'
                            : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TATTOO PROJECTS */}
          {page === 'projects' && isAdmin && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Tattoo Projects</h2>
                  <p>
                    Manage tattoo designs, project progress, and project
                    payments.
                  </p>
                </div>
              </div>

              <form onSubmit={addProject} className="form-grid compact">
                <label>
                  Customer
                  <select
                    required
                    value={projectForm.customer_id}
                    onChange={e =>
                      setProjectForm({
                        ...projectForm,
                        customer_id: e.target.value
                      })
                    }
                  >
                    <option value="">Select Customer</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Tattoo Design
                  <input
                    required
                    value={projectForm.design_details}
                    onChange={e =>
                      setProjectForm({
                        ...projectForm,
                        design_details: e.target.value
                      })
                    }
                  />
                </label>

                <label>
                  Total Tattoo Price (₱)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={projectForm.total_price}
                    onChange={e =>
                      setProjectForm({
                        ...projectForm,
                        total_price: e.target.value
                      })
                    }
                    placeholder="Enter total price"
                  />
                </label>

                <label>
                  Status
                  <select
                    value={projectForm.status}
                    onChange={e => {
                      const status = e.target.value;

                      setProjectForm({
                        ...projectForm,
                        status,
                        progress:
                          status === 'Completed' ? 100 : projectForm.progress
                      });
                    }}
                  >
                    <option value="Planned">Planned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </label>

                <label>
                  Progress (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={projectForm.progress}
                    onChange={e =>
                      setProjectForm({
                        ...projectForm,
                        progress: e.target.value
                      })
                    }
                  />
                </label>

                <label className="full">
                  Notes
                  <textarea
                    value={projectForm.notes}
                    onChange={e =>
                      setProjectForm({
                        ...projectForm,
                        notes: e.target.value
                      })
                    }
                  />
                </label>

                <div className="actions full">
                  <button
                    className="primary"
                    disabled={actionLoading === 'add-project'}
                  >
                    {actionLoading === 'add-project'
                      ? 'Adding Project...'
                      : 'Add Project'}
                  </button>
                </div>
              </form>

              <div className="project-summary">
                <div>
                  <span>Total Projects</span>
                  <b>{projects.length}</b>
                </div>

                <div>
                  <span>Ongoing</span>
                  <b>{ongoingProjects}</b>
                </div>

                <div>
                  <span>Completed</span>
                  <b>{completedProjects}</b>
                </div>
              </div>

              <div className="customer-toolbar">
                <h3>Project List</h3>
                <input
                  type="search"
                  placeholder="Search customer, design, or status..."
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                />
              </div>

              <div className="cards">
                {filteredProjects.map(p => (
                  <div className="mini-card" key={p.id}>
                    <div className="project-card-heading">
                      <span className="project-label">CUSTOMER</span>
                      <span
                        className={`project-status ${String(p.status || 'Planned')
                          .toLowerCase()
                          .replace(/\s+/g, '-')}`}
                      >
                        {p.status || 'Planned'}
                      </span>
                    </div>

                    <h3>{getCustomerName(p.customer_id)}</h3>
                    <p className="project-design">
                      {p.design_details || 'No design details'}
                    </p>

                    <div className="project-finances">
                      <div>
                        <span>Total Tattoo Price</span>
                        <strong>{peso(p.total_price)}</strong>
                      </div>

                      <div>
                        <span>Total Paid</span>
                        <strong>{peso(p.total_paid)}</strong>
                      </div>

                      <div>
                        <span>Remaining Balance</span>
                        <strong>{peso(p.remaining_balance)}</strong>
                      </div>
                    </div>

                    <div className="progress-heading">
                      <span>Project Progress</span>
                      <strong>
                        {Math.min(100, Math.max(0, Number(p.progress) || 0))}%
                      </strong>
                    </div>

                    <div className="progress">
                      <i
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, Number(p.progress) || 0)
                          )}%`
                        }}
                      />
                    </div>

                    <p className="project-notes">
                      {p.notes || 'No additional notes.'}
                    </p>

                    <div className="actions project-card-actions">
                      <button
                        type="button"
                        className="small"
                        onClick={() => startEditProject(p)}
                      >
                        Edit Project
                      </button>

                      <button
                        type="button"
                        className="small customer-delete-button"
                        onClick={() => deleteProject(p)}
                      >
                        Delete Project
                      </button>
                    </div>

                    {String(editingProjectId) === String(p.id) && (
                      <form
                        onSubmit={updateProject}
                        className="form-grid compact project-edit-form"
                      >
                        <h3 className="full">Edit Tattoo Project</h3>

                        <label>
                          Customer
                          <select
                            required
                            value={projectEditForm.customer_id}
                            onChange={e =>
                              setProjectEditForm({
                                ...projectEditForm,
                                customer_id: e.target.value
                              })
                            }
                          >
                            <option value="">Select Customer</option>
                            {customers.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Tattoo Design
                          <input
                            required
                            value={projectEditForm.design_details}
                            onChange={e =>
                              setProjectEditForm({
                                ...projectEditForm,
                                design_details: e.target.value
                              })
                            }
                          />
                        </label>

                        <label>
                          Total Tattoo Price (₱)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={projectEditForm.total_price}
                            onChange={e =>
                              setProjectEditForm({
                                ...projectEditForm,
                                total_price: e.target.value
                              })
                            }
                          />
                        </label>

                        <label>
                          Status
                          <select
                            value={projectEditForm.status}
                            onChange={e => {
                              const status = e.target.value;

                              setProjectEditForm({
                                ...projectEditForm,
                                status,
                                progress:
                                  status === 'Completed'
                                    ? 100
                                    : projectEditForm.progress
                              });
                            }}
                          >
                            <option value="Planned">Planned</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </label>

                        <label>
                          Progress (%)
                          <input
                            type="number"
                            min="0"
                            max="100"
                            required
                            value={projectEditForm.progress}
                            disabled={projectEditForm.status === 'Completed'}
                            onChange={e =>
                              setProjectEditForm({
                                ...projectEditForm,
                                progress: e.target.value
                              })
                            }
                          />
                        </label>

                        <label className="full">
                          Notes
                          <textarea
                            value={projectEditForm.notes}
                            onChange={e =>
                              setProjectEditForm({
                                ...projectEditForm,
                                notes: e.target.value
                              })
                            }
                          />
                        </label>

                        <div className="actions full">
                          <button
                            className="primary"
                            type="submit"
                            disabled={actionLoading === 'update-project'}
                          >
                            {actionLoading === 'update-project'
                              ? 'Saving...'
                              : 'Save Changes'}
                          </button>

                          <button
                            type="button"
                            onClick={cancelEditProject}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ))}

                {!filteredProjects.length && (
                  <div className="empty-state full-empty">
                    <div className="empty-icon">✎</div>
                    <h3>No tattoo projects found</h3>
                    <p>Try another search or add a new project.</p>
                  </div>
                )}
              </div>
            </section>
          )}

{/* REPORTS */}
{page === 'reports' && isAdmin && (
  <section className="panel reports-page">
    <div className="section-head reports-header">
      <div>
        <h2>Reports Dashboard</h2>
        <p>Summary of appointments, tattoo projects, and payments.</p>
      </div>

      <div className="reports-actions">
        <button
          type="button"
          className="refresh-button"
          onClick={refreshData}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : '↻ Refresh Reports'}
        </button>

        <button
          type="button"
          className="primary"
          onClick={() => window.print()}
        >
          Print Report
        </button>
      </div>
    </div>

    {/* SUMMARY CARDS */}
    <div className="reports-summary-grid">
      <div className="report-card">
        <span>Total Appointments</span>
        <h2>{appointments.length}</h2>
        <small>All appointment records</small>
      </div>

      <div className="report-card">
        <span>Total Tattoo Projects</span>
        <h2>{projects.length}</h2>
        <small>All recorded projects</small>
      </div>

      <div className="report-card">
        <span>Total Payments</span>
        <h2>{peso(totalRecordedPayments)}</h2>
        <small>{payments.length} payment records</small>
      </div>

      <div className="report-card">
        <span>Outstanding Balance</span>
        <h2>{peso(totalOutstandingBalance)}</h2>
        <small>Remaining customer balances</small>
      </div>
    </div>

    {/* APPOINTMENT STATUS */}
    <div className="reports-overview-grid">
      <div className="report-section-card">
        <h3>Appointment Summary</h3>
        <p className="report-description">
          Current appointment status overview.
        </p>

        <div className="report-status-list">
          <div>
            <span>
              <i className="report-dot pending-dot"></i>
              Pending
            </span>
            <strong>
              {appointments.filter(
                a => String(a.status || '').toLowerCase() === 'pending'
              ).length}
            </strong>
          </div>

          <div>
            <span>
              <i className="report-dot approved-dot"></i>
              Approved
            </span>
            <strong>
              {appointments.filter(
                a => String(a.status || '').toLowerCase() === 'approved'
              ).length}
            </strong>
          </div>

          <div>
            <span>
              <i className="report-dot rejected-dot"></i>
              Rejected
            </span>
            <strong>
              {appointments.filter(
                a => String(a.status || '').toLowerCase() === 'rejected'
              ).length}
            </strong>
          </div>
        </div>
      </div>

      {/* PROJECT SUMMARY */}
      <div className="report-section-card">
        <h3>Tattoo Project Summary</h3>
        <p className="report-description">
          Current progress of tattoo projects.
        </p>

        <div className="report-status-list">
          <div>
            <span>
              <i className="report-dot ongoing-dot"></i>
              Ongoing Projects
            </span>
            <strong>{ongoingProjects}</strong>
          </div>

          <div>
            <span>
              <i className="report-dot completed-dot"></i>
              Completed Projects
            </span>
            <strong>{completedProjects}</strong>
          </div>

          <div>
            <span>Total Projects</span>
            <strong>{projects.length}</strong>
          </div>
        </div>
      </div>
    </div>

    {/* PAYMENT SUMMARY */}
    <div className="report-section-card report-payment-overview">
      <h3>Payment Overview</h3>
      <p className="report-description">
        Summary of recorded Cash and GCash payments.
      </p>

      <div className="payment-overview-grid">
        <div>
          <span>Total Payment Records</span>
          <strong>{payments.length}</strong>
        </div>

        <div>
          <span>Cash Payments</span>
          <strong>
            {peso(
              payments
                .filter(
                  p => String(p.payment_method || '').toLowerCase() === 'cash'
                )
                .reduce((sum, p) => sum + Number(p.amount || 0), 0)
            )}
          </strong>
        </div>

        <div>
          <span>GCash Payments</span>
          <strong>
            {peso(
              payments
                .filter(
                  p => String(p.payment_method || '').toLowerCase() === 'gcash'
                )
                .reduce((sum, p) => sum + Number(p.amount || 0), 0)
            )}
          </strong>
        </div>

        <div>
          <span>Total Project Prices</span>
          <strong>{peso(totalProjectPrices)}</strong>
        </div>
      </div>
    </div>

    {/* MONTHLY PAYMENT CHART */}
    <div className="report-section-card">
      <h3>Monthly Payment Report</h3>
      <p className="report-description">
        Payment totals grouped by month using the available payment date.
      </p>

      {(() => {
        const monthlyPayments = {};

        payments.forEach(payment => {
          const rawDate =
            payment.created_at ||
            payment.payment_date ||
            payment.date;

          if (!rawDate) return;

          const date = new Date(rawDate);

          if (Number.isNaN(date.getTime())) return;

          const monthKey = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, '0')}`;

          if (!monthlyPayments[monthKey]) {
            monthlyPayments[monthKey] = 0;
          }

          monthlyPayments[monthKey] += Number(payment.amount || 0);
        });

        const months = Object.keys(monthlyPayments)
          .sort()
          .slice(-6);

        const maxPayment = Math.max(
          ...months.map(month => monthlyPayments[month]),
          1
        );

        return months.length ? (
          <div className="monthly-chart">
            {months.map(month => {
              const amount = monthlyPayments[month];
              const height = Math.max(
                5,
                (amount / maxPayment) * 100
              );

              const label = new Date(
                `${month}-01T00:00:00`
              ).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric'
              });

              return (
                <div className="monthly-chart-item" key={month}>
                  <strong>{peso(amount)}</strong>
                  <div className="monthly-chart-bar-area">
                    <div
                      className="monthly-chart-bar"
                      style={{ height: `${height}%` }}
                    ></div>
                  </div>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-cell">
            No payment date information available for the chart.
          </div>
        );
      })()}
    </div>

    {/* APPOINTMENT TABLE */}
    <h3 className="table-section-title">Appointment Reports</h3>

    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Contact</th>
            <th>Tattoo Preference</th>
            <th>Appointment Date</th>
            <th>Time</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {appointments.map(a => (
            <tr key={a.id}>
              <td>{a.customer_name || a.name || 'Customer'}</td>
              <td>{a.contact_number || a.contact || '-'}</td>
              <td>{a.tattoo_preference || a.tattoo || '-'}</td>
              <td>{formatDate(a.appointment_date)}</td>
              <td>{formatTime(a.appointment_time)}</td>
              <td>
                <span
                  className={`badge ${String(a.status || 'Pending')
                    .toLowerCase()
                    .replace(/\s+/g, '-')}`}
                >
                  {a.status || 'Pending'}
                </span>
              </td>
            </tr>
          ))}

          {!appointments.length && (
            <tr>
              <td colSpan="6" className="empty-cell">
                No appointment records available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    {/* PROJECT TABLE */}
    <h3 className="table-section-title">Tattoo Project Reports</h3>

    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Tattoo Design</th>
            <th>Total Price</th>
            <th>Total Paid</th>
            <th>Balance</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {projects.map(p => (
            <tr key={p.id}>
              <td>{getCustomerName(p.customer_id)}</td>
              <td>{p.design_details || '-'}</td>
              <td>{peso(p.total_price)}</td>
              <td>{peso(p.total_paid)}</td>
              <td>{peso(p.remaining_balance)}</td>
              <td>
                {Math.min(100, Math.max(0, Number(p.progress) || 0))}%
              </td>
              <td>
                <span
                  className={`project-status ${String(p.status || 'Planned')
                    .toLowerCase()
                    .replace(/\s+/g, '-')}`}
                >
                  {p.status || 'Planned'}
                </span>
              </td>
            </tr>
          ))}

          {!projects.length && (
            <tr>
              <td colSpan="7" className="empty-cell">
                No tattoo project records available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    {/* PAYMENT TABLE */}
    <h3 className="table-section-title">Payment Reports</h3>

    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Tattoo Project</th>
            <th>Amount</th>
            <th>Payment Method</th>
            <th>Payment Type</th>
            <th>Notes</th>
          </tr>
        </thead>

        <tbody>
          {payments.map(p => (
            <tr key={p.id}>
              <td>{p.customer_name || getCustomerName(p.customer_id)}</td>
              <td>{p.project_name || getProjectName(p.project_id)}</td>
              <td className="amount-cell">{peso(p.amount)}</td>
              <td>{p.payment_method || '-'}</td>
              <td>{p.payment_type || '-'}</td>
              <td>{p.notes || '-'}</td>
            </tr>
          ))}

          {!payments.length && (
            <tr>
              <td colSpan="6" className="empty-cell">
                No payment records available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </section>
)}
          {/* PAYMENTS */}
          {page === 'payments' && isAdmin && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Payment Records</h2>
                  <p>
                    Record Cash or GCash payments and track each project's balance.
                  </p>
                </div>
              </div>

              <div className="payment-summary">
                <div>
                  <span>Total Payment Records</span>
                  <b>{payments.length}</b>
                </div>

                <div>
                  <span>Total Recorded Payments</span>
                  <b>{peso(totalRecordedPayments)}</b>
                </div>

                <div>
                  <span>Total Outstanding Balance</span>
                  <b>{peso(totalOutstandingBalance)}</b>
                </div>
              </div>

              <form onSubmit={addPayment} className="form-grid compact">
                <label className="full">
                  Tattoo Project
                  <select
                    required
                    value={paymentForm.project_id}
                    onChange={e =>
                      setPaymentForm({
                        ...paymentForm,
                        project_id: e.target.value,
                        amount: ''
                      })
                    }
                  >
                    <option value="">Select Tattoo Project</option>

                    {projects
                      .filter(p => Number(p.remaining_balance || 0) > 0)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {getCustomerName(p.customer_id)} — {p.design_details}
                          {' | Balance: '}
                          {peso(p.remaining_balance)}
                        </option>
                      ))}
                  </select>
                </label>

                {selectedPaymentProject && (
                  <div className="full selected-project-summary">
                    <div>
                      <span>Customer</span>
                      <strong>{getCustomerName(selectedPaymentProject.customer_id)}</strong>
                    </div>

                    <div>
                      <span>Total Price</span>
                      <strong>{peso(selectedPaymentProject.total_price)}</strong>
                    </div>

                    <div>
                      <span>Total Paid</span>
                      <strong>{peso(selectedPaymentProject.total_paid)}</strong>
                    </div>

                    <div>
                      <span>Remaining Balance</span>
                      <strong>{peso(selectedPaymentProject.remaining_balance)}</strong>
                    </div>
                  </div>
                )}

                <label>
                  Amount (₱)
                  <input
                    type="number"
                    min="0.01"
                    max={
                      selectedPaymentProject
                        ? Number(selectedPaymentProject.remaining_balance || 0)
                        : undefined
                    }
                    step="0.01"
                    required
                    value={paymentForm.amount}
                    onChange={e =>
                      setPaymentForm({
                        ...paymentForm,
                        amount: e.target.value
                      })
                    }
                  />
                </label>

                <label>
                  Payment Method
                  <select
                    value={paymentForm.payment_method}
                    onChange={e =>
                      setPaymentForm({
                        ...paymentForm,
                        payment_method: e.target.value
                      })
                    }
                  >
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                  </select>
                </label>

                <label>
                  Payment Type
                  <select
                    value={paymentForm.payment_type}
                    onChange={e =>
                      setPaymentForm({
                        ...paymentForm,
                        payment_type: e.target.value
                      })
                    }
                  >
                    <option value="Downpayment">Downpayment</option>
                    <option value="Partial Payment">Partial Payment</option>
                    <option value="Full Payment">Full Payment</option>
                  </select>
                </label>

                <label className="full">
                  Notes
                  <textarea
                    placeholder="Optional payment details"
                    value={paymentForm.notes}
                    onChange={e =>
                      setPaymentForm({
                        ...paymentForm,
                        notes: e.target.value
                      })
                    }
                  />
                </label>

                <div className="actions full">
                  <button
                    className="primary"
                    disabled={
                      actionLoading === 'add-payment' ||
                      !projects.some(p => Number(p.remaining_balance || 0) > 0)
                    }
                  >
                    {actionLoading === 'add-payment'
                      ? 'Recording Payment...'
                      : 'Record Payment'}
                  </button>
                </div>

                {!projects.some(p => Number(p.remaining_balance || 0) > 0) && (
                  <p className="full">
                    Walang project na may remaining balance. Magdagdag muna ng
                    project na may customer at total tattoo price.
                  </p>
                )}
              </form>

              <div className="customer-toolbar">
                <h3>Payment History</h3>
                <input
                  type="search"
                  placeholder="Search customer, project, or method..."
                  value={paymentSearch}
                  onChange={e => setPaymentSearch(e.target.value)}
                />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Tattoo Project</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Type</th>
                      <th>Notes</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredPayments.map(p => (
                      <tr key={p.id}>
                        <td>{p.customer_name || getCustomerName(p.customer_id)}</td>
                        <td>{p.project_name || getProjectName(p.project_id)}</td>
                        <td className="amount-cell">{peso(p.amount)}</td>
                        <td>{p.payment_method || '-'}</td>
                        <td>{p.payment_type || '-'}</td>
                        <td>{p.notes || '-'}</td>
                      </tr>
                    ))}

                    {!filteredPayments.length && (
                      <tr>
                        <td colSpan="6" className="empty-cell">
                          No payment records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <p>
          Rembrandts Tattoo · Appointment and Project Management System
        </p>
      </footer>
    </div>
  );
}

// =========================
// APPOINTMENT TABLE
// =========================

function AppointmentTable({
  appointments,
  onStatus,
  canManage,
  formatDate,
  formatTime,
  actionLoading = ''
}) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  if (!appointments.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">▦</div>
        <h3>No appointment requests found</h3>
        <p>Try changing your search or filter, or check again later.</p>
      </div>
    );
  }

  const getImageUrl = appointment =>
    appointment.tattoo_image
      ? `${SERVER_URL}${appointment.tattoo_image}`
      : null;

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact</th>
              <th>Tattoo</th>
              <th>Reference Image</th>
              <th>Date</th>
              <th>Time</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {appointments.map(a => {
              const status = a.status || 'Pending';
              const statusClass = status.toLowerCase().replace(/\s+/g, '-');
              const imageUrl = getImageUrl(a);
              const isUpdating = actionLoading === `appointment-${a.id}`;

              return (
                <tr key={a.id}>
                  <td className="customer-cell">
                    {a.customer_name || a.name || 'Customer'}
                  </td>

                  <td>{a.contact_number || a.contact || '-'}</td>

                  <td className="tattoo-cell">
                    {a.tattoo_preference || a.tattoo || '-'}
                  </td>

                  <td>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Tattoo reference"
                        onClick={() => setSelectedImage(imageUrl)}
                        style={{
                          width: '65px',
                          height: '65px',
                          objectFit: 'cover',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      />
                    ) : (
                      <span className="no-action">No image</span>
                    )}
                  </td>

                  <td>
                    {formatDate
                      ? formatDate(a.appointment_date)
                      : a.appointment_date || '-'}
                  </td>

                  <td>
                    {formatTime
                      ? formatTime(a.appointment_time)
                      : a.appointment_time || '-'}
                  </td>

                  <td>
                    <span className={`badge ${statusClass}`}>
                      {status}
                    </span>
                  </td>

                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="small"
                        onClick={() => setSelectedAppointment(a)}
                      >
                        View Details
                      </button>

                      {canManage && status === 'Pending' && (
                        <>
                          <button
                            type="button"
                            className="small approve"
                            disabled={isUpdating}
                            onClick={() => onStatus(a.id, 'Approved')}
                          >
                            {isUpdating ? 'Updating...' : 'Approve'}
                          </button>

                          <button
                            type="button"
                            className="small reject"
                            disabled={isUpdating}
                            onClick={() => onStatus(a.id, 'Rejected')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedAppointment && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedAppointment(null)}
          style={{ zIndex: 9998 }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '650px', width: '95%' }}
          >
            <div className="modal-header">
              <div>
                <h2>Appointment Details</h2>
                <p>Complete information for this appointment.</p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedAppointment(null)}
              >
                ×
              </button>
            </div>

            <div
              className="detail-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px',
                marginTop: '18px'
              }}
            >
              <div>
                <strong>Customer Name</strong>
                <p>
                  {selectedAppointment.customer_name ||
                    selectedAppointment.name ||
                    'Customer'}
                </p>
              </div>

              <div>
                <strong>Contact Number</strong>
                <p>
                  {selectedAppointment.contact_number ||
                    selectedAppointment.contact ||
                    '-'}
                </p>
              </div>

              <div>
                <strong>Email Address</strong>
                <p>
                  {selectedAppointment.customer_email ||
                    selectedAppointment.email ||
                    '-'}
                </p>
              </div>

              <div>
                <strong>Appointment Date</strong>
                <p>
                  {formatDate
                    ? formatDate(selectedAppointment.appointment_date)
                    : selectedAppointment.appointment_date || '-'}
                </p>
              </div>

              <div>
                <strong>Appointment Time</strong>
                <p>
                  {formatTime
                    ? formatTime(selectedAppointment.appointment_time)
                    : selectedAppointment.appointment_time || '-'}
                </p>
              </div>

              <div>
                <strong>Status</strong>
                <p>
                  <span
                    className={`badge ${(selectedAppointment.status || 'Pending')
                      .toLowerCase()
                      .replace(/\s+/g, '-')}`}
                  >
                    {selectedAppointment.status || 'Pending'}
                  </span>
                </p>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <strong>Tattoo Design / Preference</strong>
                <p style={{ whiteSpace: 'pre-wrap' }}>
                  {selectedAppointment.tattoo_preference ||
                    selectedAppointment.tattoo ||
                    '-'}
                </p>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <strong>Additional Notes</strong>
                <p style={{ whiteSpace: 'pre-wrap' }}>
                  {selectedAppointment.notes || '-'}
                </p>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <strong>Tattoo Reference Image</strong>

                {getImageUrl(selectedAppointment) ? (
                  <img
                    src={getImageUrl(selectedAppointment)}
                    alt="Tattoo reference"
                    onClick={() =>
                      setSelectedImage(getImageUrl(selectedAppointment))
                    }
                    style={{
                      display: 'block',
                      marginTop: '8px',
                      maxWidth: '100%',
                      maxHeight: '260px',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  />
                ) : (
                  <p>No reference image uploaded.</p>
                )}
              </div>
            </div>

            {canManage &&
              (selectedAppointment.status || 'Pending') === 'Pending' && (
                <div className="table-actions" style={{ marginTop: '22px' }}>
                  <button
                    type="button"
                    className="small approve"
                    onClick={() => {
                      onStatus(selectedAppointment.id, 'Approved');
                      setSelectedAppointment(null);
                    }}
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    className="small reject"
                    onClick={() => {
                      onStatus(selectedAppointment.id, 'Rejected');
                      setSelectedAppointment(null);
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}
          </div>
        </div>
      )}

      {selectedImage && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedImage(null)}
          style={{ zIndex: 9999 }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '700px' }}
          >
            <div className="modal-header">
              <div>
                <h2>Tattoo Reference Image</h2>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedImage(null)}
              >
                ×
              </button>
            </div>

            <img
              src={selectedImage}
              alt="Full tattoo reference"
              style={{
                width: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);