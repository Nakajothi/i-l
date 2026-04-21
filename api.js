const API = {
  BASE: (() => {
    if (typeof window === 'undefined') return 'http://localhost:3000/api';
    if (window.location.protocol === 'file:') return 'http://localhost:3000/api';
    return `${window.location.origin}/api`;
  })(),

  studentToken() {
    return localStorage.getItem('ilearn_student_token');
  },

  teacherToken() {
    return localStorage.getItem('ilearn_teacher_token');
  },

  async request(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(`${this.BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (_error) {
      throw new Error('Could not reach the server. Please check the deployment or backend service.');
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await response.json() : {};

    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }

    return payload;
  },

  get(path, token) {
    return this.request('GET', path, null, token);
  },

  post(path, body, token) {
    return this.request('POST', path, body, token);
  },

  async registerStudent(payload) {
    const data = await this.post('/student/register', payload);
    localStorage.setItem('ilearn_student_token', data.token);
    localStorage.setItem('ilearn_student', JSON.stringify(data.student));
    localStorage.removeItem('ilearn_teacher_token');
    localStorage.removeItem('ilearn_teacher');
    return data;
  },

  async loginStudent(email, password) {
    const data = await this.post('/student/login', { email, password });
    localStorage.setItem('ilearn_student_token', data.token);
    localStorage.setItem('ilearn_student', JSON.stringify(data.student));
    localStorage.removeItem('ilearn_teacher_token');
    localStorage.removeItem('ilearn_teacher');
    return data;
  },

  getStudentProfile() {
    return this.get('/student/profile', this.studentToken());
  },

  async loginTeacher(email, password) {
    const data = await this.post('/teacher/login', { email, password });
    localStorage.setItem('ilearn_teacher_token', data.token);
    localStorage.setItem('ilearn_teacher', JSON.stringify(data.teacher));
    localStorage.removeItem('ilearn_student_token');
    localStorage.removeItem('ilearn_student');
    localStorage.removeItem('ilearn_student_profile');
    return data;
  },

  getTeacherStudents(date) {
    const suffix = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.get(`/teacher/students${suffix}`, this.teacherToken());
  },

  saveTeacherAttendance(payload) {
    return this.post('/teacher/attendance', payload, this.teacherToken());
  },

  saveTeacherWeeklyTests(payload) {
    return this.post('/teacher/weekly-tests', payload, this.teacherToken());
  },

  saveTeacherFees(payload) {
    return this.post('/teacher/fees', payload, this.teacherToken());
  },

  logoutStudent() {
    localStorage.removeItem('ilearn_student_token');
    localStorage.removeItem('ilearn_student');
    localStorage.removeItem('ilearn_student_profile');
    window.location.href = '/';
  },

  logoutTeacher() {
    localStorage.removeItem('ilearn_teacher_token');
    localStorage.removeItem('ilearn_teacher');
    window.location.href = '/';
  },

  health() {
    return this.get('/health');
  }
};



