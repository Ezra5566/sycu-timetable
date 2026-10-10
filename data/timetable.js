/* SYCU timetable data — 2026-2027-1 专业课表 */
window.SYCU_DATA = {
  "metadata": {
    "source": "2026-2027-1 专业课表",
    "generated": "2026-10-09",
    "timezone": "Asia/Shanghai",
    "totalSemesters": 3,
    "totalPrograms": 15
  },
  "timeSlotFormats": {
    "standard8": {
      "description": "Used by 2025 Autumn and 2026 Spring",
      "slots": [
        { "session": 1, "time": "8:20-9:05", "period": "morning" },
        { "session": 2, "time": "9:15-10:00", "period": "morning" },
        { "session": 3, "time": "10:20-11:05", "period": "morning" },
        { "session": 4, "time": "11:15-12:00", "period": "morning" },
        { "session": 5, "time": "13:30-14:15", "period": "afternoon" },
        { "session": 6, "time": "14:25-15:10", "period": "afternoon" },
        { "session": 7, "time": "15:20-16:05", "period": "afternoon" },
        { "session": 8, "time": "16:15-17:00", "period": "afternoon" }
      ]
    },
    "block4": {
      "description": "Used by 2026 Autumn",
      "slots": [
        { "session": "1-2", "time": "8:20-10:00", "period": "morning" },
        { "session": "3-4", "time": "10:20-12:00", "period": "morning" },
        { "session": "5-6", "time": "13:30-15:10", "period": "afternoon" },
        { "session": "7-8", "time": "15:20-17:00", "period": "afternoon" }
      ]
    }
  },
  "semesters": [
    {
      "id": "2026-autumn",
      "name": "2026 Autumn",
      "nameCN": "2026秋季",
      "timeSlotFormat": "block4",
      "programs": [
        {
          "id": "chinese-elementary-2026a",
          "name": "Chinese Language (Elementary Level) 1",
          "nameCN": "初级汉语言文学（国际）1",
          "schedule": [
            { "day": "Monday", "session": "5-6", "course": "Chinese Language", "location": "N107" },
            { "day": "Tuesday", "session": "5-6", "course": "Chinese Language", "location": "N107" },
            { "day": "Thursday", "session": "1-2", "course": "Chinese Language", "location": "N106" }
          ]
        },
        {
          "id": "chinese-intermediate-2026a",
          "name": "Chinese Language (Intermediate Level) 1",
          "nameCN": "中级汉语言文学（国际）1",
          "schedule": [
            { "day": "Monday", "session": "1-2", "course": "Chinese Language", "location": "N107" },
            { "day": "Wednesday", "session": "5-6", "course": "Chinese Language", "location": "N107" },
            { "day": "Friday", "session": "1-2", "course": "Chinese Language", "location": "N107" }
          ]
        },
        {
          "id": "ai-2026a",
          "name": "Artificial Intelligence (International) 1",
          "nameCN": "人工智能（国际）1",
          "schedule": [
            { "day": "Monday", "session": "1-2", "course": "Chinese Language", "location": "G410" },
            { "day": "Wednesday", "session": "5-6", "course": "Introduction to the Major", "location": "G309" },
            { "day": "Wednesday", "session": "7-8", "course": "Chinese Language", "location": "G310" },
            { "day": "Thursday", "session": "5-6", "course": "Advanced Mathematics (A) 1", "location": "G310" }
          ]
        },
        {
          "id": "civil-2026a",
          "name": "Civil Engineering (International) 1",
          "nameCN": "土木工程（国际）1",
          "schedule": [
            { "day": "Monday", "session": "1-2", "course": "Chinese Language", "location": "G410" },
            { "day": "Tuesday", "session": "5-6", "course": "Introduction to the Major", "location": "G315" },
            { "day": "Wednesday", "session": "7-8", "course": "Chinese Language", "location": "G310" },
            { "day": "Thursday", "session": "5-6", "course": "Advanced Mathematics (A) 1", "location": "G310" }
          ]
        },
        {
          "id": "business-2026a",
          "name": "Business Administration (International) 1",
          "nameCN": "工商管理（国际）1",
          "schedule": [
            { "day": "Monday", "session": "1-2", "course": "Chinese Language", "location": "G410" },
            { "day": "Monday", "session": "5-6", "course": "Introduction to the Major", "location": "G410" },
            { "day": "Wednesday", "session": "7-8", "course": "Chinese Language", "location": "G310" },
            { "day": "Thursday", "session": "5-6", "course": "Advanced Mathematics (A) 1", "location": "G310" }
          ]
        },
        {
          "id": "cs-2026a",
          "name": "Computer Science and Technology (International) 1",
          "nameCN": "计算机科学与技术（国际）1",
          "schedule": [
            { "day": "Monday", "session": "1-2", "course": "Chinese Language", "location": "G410" },
            { "day": "Wednesday", "session": "5-6", "course": "Introduction to the Major", "location": "G310" },
            { "day": "Wednesday", "session": "7-8", "course": "Chinese Language", "location": "G310" },
            { "day": "Thursday", "session": "5-6", "course": "Advanced Mathematics (A) 1", "location": "G310" }
          ]
        }
      ]
    },
    {
      "id": "2026-spring",
      "name": "2026 Spring",
      "nameCN": "2026春季",
      "timeSlotFormat": "standard8",
      "programs": [
        {
          "id": "civil-engineering-2026s",
          "name": "Civil Engineering (International) 1",
          "nameCN": "土木工程（国际）1",
          "schedule": [
            { "day": "Monday", "session": 5, "course": "Architectural Mechanics (International)", "location": "N301" },
            { "day": "Tuesday", "session": 5, "course": "Architectural Mechanics (International)", "location": "N301" },
            { "day": "Wednesday", "session": 1, "course": "Chinese, Major 1-2 (International)", "location": "N106" },
            { "day": "Wednesday", "session": 5, "course": "Civil Engineering Drawing (International)", "location": "N301" },
            { "day": "Thursday", "session": 1, "course": "Civil Engineering Drawing (International)", "location": "N301" },
            { "day": "Thursday", "session": 5, "course": "University Physics A 1 (International)", "location": "N107" },
            { "day": "Friday", "session": 1, "course": "MATHS (A2) (International)", "location": "N106" }
          ]
        },
        {
          "id": "ai-2026s",
          "name": "Artificial Intelligence (International) 1",
          "nameCN": "人工智能（国际）1",
          "schedule": [
            { "day": "Monday", "session": 5, "course": "Python Programming (International)", "location": "N302" },
            { "day": "Tuesday", "session": 3, "course": "Prompt Engineering (International)", "location": "N103" },
            { "day": "Tuesday", "session": 5, "course": "Python Programming (International)", "location": "N302" },
            { "day": "Wednesday", "session": 1, "course": "Chinese, Major 1-2 (International)", "location": "N106" },
            { "day": "Thursday", "session": 3, "course": "Prompt Engineering (International)", "location": "N103" },
            { "day": "Thursday", "session": 5, "course": "University Physics A 1 (International)", "location": "N107" },
            { "day": "Friday", "session": 1, "course": "MATHS (A2) (International)", "location": "N106" }
          ]
        },
        {
          "id": "cs-2026s",
          "name": "Computer Science and Technology (International) 1",
          "nameCN": "计算机科学与技术（国际）1",
          "schedule": [
            { "day": "Tuesday", "session": 5, "course": "Fundamentals of Programming (International)", "location": "N103" },
            { "day": "Wednesday", "session": 1, "course": "Chinese, Major 1-2 (International)", "location": "N106" },
            { "day": "Wednesday", "session": 5, "course": "Discrete Mathematics (International)", "location": "N105" },
            { "day": "Thursday", "session": 5, "course": "University Physics A 1 (International)", "location": "N107" },
            { "day": "Friday", "session": 1, "course": "MATHS (A2) (International)", "location": "N106" },
            { "day": "Friday", "session": 5, "course": "Discrete Mathematics (International)", "location": "N105" }
          ]
        },
        {
          "id": "chinese-lit-2026s",
          "name": "Chinese Language and Literature (International) 1",
          "nameCN": "汉语言文学（国际）1",
          "schedule": [
            { "day": "Monday", "session": 5, "course": "Chinese, Major 1-2 (International)", "location": "N106" },
            { "day": "Tuesday", "session": 5, "course": "Chinese, Major 1-2 (International)", "location": "N106" },
            { "day": "Wednesday", "session": 5, "course": "Chinese, Major 1-2 (International)", "location": "N106" }
          ]
        },
        {
          "id": "business-2026s",
          "name": "Business Administration (International) 1",
          "nameCN": "工商管理（国际）1",
          "schedule": [
            { "day": "Monday", "session": 5, "course": "Management (International)", "location": "N104" },
            { "day": "Tuesday", "session": 5, "course": "Human Resource Management (International)", "location": "N104" },
            { "day": "Wednesday", "session": 1, "course": "Chinese, Major 1-2 (International)", "location": "N106" },
            { "day": "Friday", "session": 1, "course": "MATHS (A2) (International)", "location": "N106" }
          ]
        }
      ]
    },
    {
      "id": "2025-autumn",
      "name": "2025 Autumn",
      "nameCN": "2025秋季",
      "timeSlotFormat": "standard8",
      "programs": [
        {
          "id": "ai-2025a",
          "name": "Artificial Intelligence (International) 1",
          "nameCN": "人工智能（国际）1",
          "schedule": [
            { "day": "Monday", "session": 3, "course": "AI Ethics (International)", "location": "N103" },
            { "day": "Wednesday", "session": 1, "course": "Chinese, Major 2-1 (International)", "location": "N107" },
            { "day": "Wednesday", "session": 3, "course": "AI Ethics (International)", "location": "N103" },
            { "day": "Thursday", "session": 3, "course": "Chinese, Major 2-1 (International)", "location": "N107" },
            { "day": "Thursday", "session": 5, "course": "Prompt Engineering (International)", "location": "N103" }
          ]
        },
        {
          "id": "cs-2025a",
          "name": "Computer Science and Technology (International) 1",
          "nameCN": "计算机科学与技术（国际）1",
          "schedule": [
            { "day": "Monday", "session": 1, "course": "Data Structures and Algorithms (International)", "location": "N104" },
            { "day": "Tuesday", "session": 3, "course": "Computer Organization Principles (International)", "location": "N302" },
            { "day": "Wednesday", "session": 1, "course": "Chinese, Major 2-1 (International)", "location": "N107" },
            { "day": "Thursday", "session": 3, "course": "Chinese, Major 2-1 (International)", "location": "N107" },
            { "day": "Friday", "session": 3, "course": "Computer Organization Principles (International)", "location": "N302" }
          ]
        },
        {
          "id": "business-2025a",
          "name": "Business Administration (International) 1",
          "nameCN": "工商管理（国际）1",
          "schedule": [
            { "day": "Monday", "session": 5, "course": "Organizational Behavior (International)", "location": "N105" },
            { "day": "Tuesday", "session": 3, "course": "Business and Technology (International)", "location": "N104" },
            { "day": "Tuesday", "session": 5, "course": "Human Resource Management (International)", "location": "N104" },
            { "day": "Wednesday", "session": 1, "course": "Chinese, Major 2-1 (International)", "location": "N107" },
            { "day": "Wednesday", "session": 3, "course": "Microeconomics (International)", "location": "N104" },
            { "day": "Thursday", "session": 3, "course": "Chinese, Major 2-1 (International)", "location": "N107" }
          ]
        },
        {
          "id": "robotics-2025a",
          "name": "Robotics Engineering (International) 1",
          "nameCN": "机器人工程（国际）1",
          "schedule": [
            { "day": "Monday", "session": 3, "course": "AI Thinking and Ethics (International)", "location": "N103" },
            { "day": "Tuesday", "session": 5, "course": "Fundamentals of Electronic Technology (International)", "location": "N105" },
            { "day": "Wednesday", "session": 1, "course": "Chinese, Major 2-1 (International)", "location": "N107" },
            { "day": "Wednesday", "session": 3, "course": "AI Thinking and Ethics (International)", "location": "N103" },
            { "day": "Thursday", "session": 3, "course": "Chinese, Major 2-1 (International)", "location": "N107" },
            { "day": "Thursday", "session": 5, "course": "Prompt Engineering (International)", "location": "N103" }
          ]
        }
      ]
    }
  ],
  "locations": {
    "N103": { "building": "N", "room": "103", "campus": "Main" },
    "N104": { "building": "N", "room": "104", "campus": "Main" },
    "N105": { "building": "N", "room": "105", "campus": "Main" },
    "N106": { "building": "N", "room": "106", "campus": "Main" },
    "N107": { "building": "N", "room": "107", "campus": "Main" },
    "N301": { "building": "N", "room": "301", "campus": "Main" },
    "N302": { "building": "N", "room": "302", "campus": "Main" },
    "G309": { "building": "G", "room": "309", "campus": "Main" },
    "G310": { "building": "G", "room": "310", "campus": "Main" },
    "G315": { "building": "G", "room": "315", "campus": "Main" },
    "G410": { "building": "G", "room": "410", "campus": "Main" }
  }
};
