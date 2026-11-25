const { learn, mcq, tf, multi, match, order, viz, scenario, talk, world, lesson } = require('./_h.cjs');

module.exports = world('tools', 'Toolbox: the basics before the basics', 'absolute basics',
  'From zero, in plain words: how computers store data, how to type commands, how to set up a project, how Git works, what the tools look like, how everything connects, and how logins work.',
  [
    lesson('t1', 'Computers, data and the internet, from zero', 15, [
      learn('How big is data?', `
        Data is measured in **bytes**. One byte is about one letter.

        | Size | Roughly | Example |
        |---|---|---|
        | 1 KB (kilobyte) | 1,000 bytes | one claim record |
        | 1 MB (megabyte) | 1,000 KB | a photo, or 5,000 rows in a spreadsheet |
        | 1 GB (gigabyte) | 1,000 MB | a few million rows |
        | 1 TB (terabyte) | 1,000 GB | billions of rows: too big for one laptop |
        | 1 PB (petabyte) | 1,000 TB | a big company's whole data store |

        When data gets to the TB range, **one computer is not enough**. That's why tools like Spark exist: they split the work across many computers.
      `),
      learn('The four parts of a computer that matter', `
        | Part | What it does | Kitchen version |
        |---|---|---|
        | **CPU** | does the calculations. It has several **cores**, which can work at the same time | the cooks |
        | **RAM (memory)** | fast, temporary space for what you're working on now. Emptied when the computer turns off | the counter top |
        | **Disk** | slow, permanent storage | the fridge and cupboards |
        | **Network** | talks to other computers | the delivery van |

        Most "big data" problems are one of these running out: the data doesn't fit on the counter (RAM), there aren't enough cooks (CPU), or the van is too slow (network).
      `),
      learn('Files, tables and databases', `
        - A **file** is data saved on disk, like «claims.csv» or a spreadsheet.
        - A **table** is data in rows and columns, where each column has a type (number, text, date).
        - A **database** is a program that stores tables and answers questions about them. You ask in **SQL**. Salesforce has a database inside it.
      `),
      learn('How computers talk to each other', `
        When you open a website, your laptop (the **client**) sends a request to another computer (the **server**).

        To find the right program on that server you need two things:
        - its **address** (called the **host**), like «google.com» or «localhost» (*this same computer*)
        - a **port**: a door number, because one computer runs many programs. Websites use door 443, the Postgres database uses 5432, Kafka uses 9092.

        So «localhost:9092» just means *"this computer, door 9092"*.

        An **API** is a set of rules programs use to ask each other for data. Salesforce's API is how a program can copy out records automatically, without a person clicking export.
      `),
      match('Match each word to what it means.', [
        ['localhost:9092', 'This computer, door number 9092'],
        ['API', 'Rules programs use to ask each other for data'],
        ['RAM', 'Fast, temporary working space'],
        ['Disk', 'Slow but permanent storage'],
      ]),
      mcq('A file is 80 GB. Your laptop has 16 GB of RAM. What happens if you try to load all of it into memory at once?', ['It works fine', 'It runs out of memory. You read it in smaller pieces, or use a tool like Spark that splits the work', 'It loads only the first 16 GB', 'The file shrinks automatically'], 1),
      order('Put these sizes from smallest to largest.', ['1 KB', '1 MB', '1 GB', '1 TB', '1 PB']),
      tf('When a program asks Salesforce\'s API for data, it has to prove who it is, like logging in.', true, 'Programs use special keys or tokens instead of a person\'s password. More on this in the last lesson of this stage.'),
    ]),
    lesson('t2', 'The terminal: typing commands', 18, [
      learn('What the terminal is', `
        The **terminal** is a window where you type instructions instead of clicking. You type a command, press Enter, and the computer answers with text.

        - On a Mac it's called **Terminal**.
        - On Windows, use **WSL** (a free add-on that gives you a Linux terminal inside Windows; data tools work best there).

        You don't need to learn much. About 10 commands cover most of what a data engineer types:

        | Type this | It does |
        |---|---|
        | «pwd» | shows which folder you are in |
        | «ls» | lists the files in this folder |
        | «cd foldername» | goes into a folder («cd ..» goes back out) |
        | «mkdir foldername» | makes a new folder |
        | «head claims.csv» | shows the first lines of a file |
        | «python myfile.py» | runs a Python file |
      `),
      learn('Anatomy of a command', `
        Commands look scary at first. They're built from the same few parts:

        | Part | What it is | Example |
        |---|---|---|
        | **program** | the tool you are using | «head», «git», «python» |
        | **flag** (also called an option) | a switch that changes what the tool does. It starts with a dash «-» | «-n» |
        | **value** | the thing the program or flag works on | «3», «claims.csv» |

        Example: «head -n 3 claims.csv»
        - «head» → the program: *show the start of a file*
        - «-n 3» → the flag «-n» means *number of lines*, and «3» is that number
        - «claims.csv» → *which file*

        In plain English: **"show me the first 3 lines of claims.csv."**

        Some programs also have an **action word** after their name. Example: «git push»: the program is «git», the action is «push» (upload).

        You never have to memorise flags. In every exercise here, each part is explained before you type it. On a real computer, adding «--help» to a command shows its options.
      `),
      viz('terminal', 'Practise in a safe terminal', 'Nothing here touches a real computer.', {
        missions: [
          { task: 'Find out which folder you are in.', accept: '^pwd$', out: '/home/you', hint: 'pwd' },
          { task: 'Make a new folder called «warranty-pipeline».', accept: '^mkdir\\s+warranty-pipeline$', out: '', hint: 'mkdir warranty-pipeline' },
          { task: 'Go into that folder.', accept: '^cd\\s+warranty-pipeline/?$', out: '', hint: 'cd warranty-pipeline' },
          { task: 'See what files are inside (someone already put a «claims.csv» there).', accept: '^(ls|ls -l|ls -la|dir)$', out: 'claims.csv  README.md', hint: 'ls' },
          { task: 'Show only the first 3 lines of «claims.csv».', accept: '^head\\s+(-n\\s*)?-?3\\s+claims\\.csv$', out: 'claim_id,dealer_id,claim_amount,status\n1,4,124500.00,Approved\n2,7,88000.50,Rejected', why: 'The first line is the header: the column names.', hint: 'head -n 3 claims.csv' },
          { task: 'Count how many lines the file has.', accept: '^wc\\s+-l\\s+claims\\.csv$', out: '98 claims.csv', why: '98 lines = 1 header line + 97 claims.', hint: 'wc -l claims.csv' },
          { task: 'Find the lines that say «Approved», and count them. The «|» sign passes the result of the first command into the second.', accept: '^grep\\s+["\']?Approved["\']?\\s+claims\\.csv\\s*\\|\\s*wc\\s+-l$', out: '41', why: 'grep found the Approved lines, then wc counted them: 41 approved claims.', hint: 'grep "Approved" claims.csv | wc -l' },
        ],
      }, 'You moved around folders, looked inside a file, searched it and counted. That is most of what you need.'),
      mcq('You want to see the first lines of a huge 30 GB file without opening it. Which command?', ['open bigfile.csv', 'head -n 5 bigfile.csv', 'delete bigfile.csv', 'show all bigfile.csv'], 1, '«head» reads only the beginning, so it is instant even for huge files.'),
      tf('Data engineers spend most of their day typing in the terminal.', false, 'Most of the day is spent in a code editor, in notebooks and in web pages. The terminal is for setup, saving code with Git, and running checks.'),
    ]),
    lesson('t3', 'Setting up a project, step by step', 18, [
      learn('What "setting up a project" means', `
        A project is just **a folder of code**, plus **the tools that code needs** installed on your computer.

        **Why a "virtual environment"?** Python projects use libraries (ready-made code). Project A might need version 1 of a library and project B version 2. A **virtual environment** is a private box of libraries for one project, so projects never break each other. It lives in a folder usually called «.venv».

        **The usual steps (once per project):**
        1. Install the basics once: **Python**, **Git** and a code editor (**VS Code**).
        2. **Download the project** from GitHub (this is called *cloning*).
        3. **Make the private box** (virtual environment) and switch it on.
        4. **Install the libraries** the project lists in a file called «requirements.txt».
        5. **Run the checks** (tests) to make sure everything works.
        6. **Run the project.**

        «««flow
        Install basics -> Download project -> Make private box -> Install libraries -> Run checks -> Run project
        »»»
      `),
      learn('What a project folder looks like', `
        «««text
        warranty-pipeline/
          README.md            <- instructions: what this is and how to run it
          requirements.txt     <- the list of libraries it needs
          src/clean_claims.py  <- the actual code
          tests/               <- automatic checks
          .env.example         <- names of settings (never real passwords)
        »»»
        **At a company**, the big systems (servers, storage, permissions) are already set up by another team. You download the team's project, do these same steps, and start working.
      `),
      viz('terminal', 'Set up a project yourself', 'Real commands, pretend output.', {
        missions: [
          { task: 'Download the team\'s project from GitHub.', accept: '^git\\s+clone\\s+\\S+warranty-pipeline(\\.git)?$', out: "Cloning into 'warranty-pipeline'...\nReceiving objects: 100% (214/214), done.", why: 'You now have your own copy of the project in a folder called warranty-pipeline.', hint: 'git clone https://github.com/acme/warranty-pipeline.git' },
          { task: 'Go into the project folder.', accept: '^cd\\s+warranty-pipeline/?$', out: '', hint: 'cd warranty-pipeline' },
          { task: 'Make the private box of libraries (the virtual environment), in a folder called «.venv».', accept: '^python3?\\s+-m\\s+venv\\s+\\.venv$', out: '', why: 'Nothing is printed, which means it worked.', hint: 'python -m venv .venv' },
          { task: 'Switch the private box on.', accept: '^(source|\\.)\\s+\\.venv/bin/activate$', out: '(.venv) $', why: 'See "(.venv)" at the start? That tells you the private box is on.', hint: 'source .venv/bin/activate' },
          { task: 'Install every library the project lists in «requirements.txt».', accept: '^pip3?\\s+install\\s+-r\\s+requirements\\.txt$', out: 'Successfully installed pandas-2.2.3 pytest-8.3.4 requests-2.32.3', hint: 'pip install -r requirements.txt' },
          { task: 'Run the automatic checks.', accept: '^(python\\s+-m\\s+)?pytest(\\s+-q)?$', out: '......                                   [100%]\n6 passed in 1.2s', why: '6 passed = everything works.', hint: 'pytest' },
          { task: 'Run the project\'s code: the file «src/clean_claims.py».', accept: '^python3?\\s+src/clean_claims\\.py$', out: 'Read 97 claims · removed 3 duplicates · wrote 94 rows to output/clean_claims.csv', hint: 'python src/clean_claims.py' },
        ],
      }, 'That is the whole setup. Every real project\'s README lists steps like these.'),
      order('Put the setup steps in order.', ['Install Python, Git and VS Code', 'Download the project (git clone)', 'Make and switch on the virtual environment', 'Install the libraries (pip install -r requirements.txt)', 'Run the checks (pytest)', 'Run the project']),
      mcq('Why does each project get its own virtual environment?', ['It makes Python faster', 'Each project keeps its own library versions, so one project can\'t break another', 'GitHub requires it', 'It hides the code'], 1),
    ]),
    lesson('t4', 'Git and GitHub: saving and sharing your work', 18, [
      learn('Git in plain words', `
        **Git** is like "track changes" for code. Every time you reach a good point, you **save a version** (called a **commit**). You can always go back.

        **GitHub** is a website that stores your Git projects online, so your team can see them, review them and work together. Your company may use its own private version.

        Four words to know:
        - **Repository (repo):** a project folder tracked by Git.
        - **Commit:** a saved version, with a short note saying what changed.
        - **Branch:** a separate copy of the work where you try a change without touching the main version. The main version is called «main».
        - **Pull request (PR):** on GitHub, a request saying *"please review my branch and add it to main"*. Teammates comment, automatic checks run, then it's merged.

        «««flow
        Make a branch -> Edit files -> Pick the changes (git add) -> Save a version (git commit) -> Upload (git push) -> Open a pull request on GitHub -> Review -> Merge into main
        »»»
      `),
      viz('terminal', 'Make a change the way teams do', '', {
        missions: [
          { task: 'See which files you changed.', accept: '^git\\s+status$', out: 'On branch main\nmodified:   src/clean_claims.py', why: 'Git noticed you edited clean_claims.py.', hint: 'git status' },
          { task: 'Make a new branch called «feat/remove-duplicates» and switch to it.', accept: '^git\\s+(checkout\\s+-b|switch\\s+-c)\\s+feat/remove-duplicates$', out: "Switched to a new branch 'feat/remove-duplicates'", why: '"feat/" is a common way to say "this branch adds a feature".', hint: 'git checkout -b feat/remove-duplicates' },
          { task: 'Pick «src/clean_claims.py» to include in your next saved version.', accept: '^git\\s+add\\s+(src/clean_claims\\.py|\\.|-A)$', out: '', hint: 'git add src/clean_claims.py' },
          { task: 'Save the version, with a short note.', accept: '^git\\s+commit\\s+-m\\s+["\'].+["\']$', out: '[feat/remove-duplicates 3f2a91c] Remove duplicate claims\n 1 file changed, 12 insertions(+)', hint: 'git commit -m "Remove duplicate claims"' },
          { task: 'Upload your branch to GitHub.', accept: '^git\\s+push\\s+(-u\\s+)?origin\\s+feat/remove-duplicates$', out: 'remote: Create a pull request for \'feat/remove-duplicates\' on GitHub by visiting:\nremote:   https://github.com/acme/warranty-pipeline/pull/new/feat/remove-duplicates', why: 'Next you would open that link and create a pull request for review.', hint: 'git push -u origin feat/remove-duplicates' },
        ],
      }),
      match('Match each Git word with its meaning.', [['commit', 'A saved version with a note'], ['push', 'Upload your work to GitHub'], ['branch', 'A separate copy to try changes safely'], ['pull request', 'Asking the team to review and merge your work']]),
      mcq('Where do teammates review your code?', ['In the terminal', 'On the pull request page on GitHub', 'By email', 'They don\'t'], 1),
    ]),
    lesson('t6', 'What the tools look like', 15, [
      learn('Most of the work happens in web pages', `
        You open most data tools in your web browser and log in with your company account (like opening Outlook). In the next exercise you click through simple pictures of the screens you'll use. Don't worry about the details yet; each tool gets its own lessons later.

        | Screen | What you do there |
        |---|---|
        | **Scheduler** (Airflow, Data Factory) | see which data jobs ran overnight and which failed |
        | **Notebook** (Databricks, Jupyter) | write and try code, see results right below it |
        | **Spark UI** | see why a big job was slow |
        | **SQL editor** | write SQL and see the result table |
        | **Catalog** | find a table: what it means, who owns it, where its data comes from |
        | **Kafka screen** | see live messages flowing in |
        | **Cloud portal** (Azure) | see the company's storage and servers |
        | **GitHub** | review code changes |
      `),
      viz('uitour', 'Click through each screen', 'Simple pictures of the real tools.'),
      match('Where would you go to…', [
        ['See which job failed last night', 'The scheduler (Airflow / Data Factory)'],
        ['Try some code and see the result right away', 'A notebook'],
        ['Find out what a table means and who owns it', 'The catalog'],
        ['Review a teammate\'s code', 'A GitHub pull request'],
      ]),
      tf('You need to install and log in to each of these tools separately with different passwords.', false, 'At a company, one company login (called single sign-on) opens all of them in the browser.'),
    ]),
    lesson('t7', 'The whole picture: how everything connects', 20, [
      learn('Before the map', `
        The next exercise shows a **map of a real company data setup**. Each box is one tool. Click any box to see, in plain words, what it is, how you use it and how you log in.

        Three new words you'll see on the map:
        - **Kafka**: a system that carries a continuous flow of messages (like engine sensor readings), like a conveyor belt.
        - **Data lake**: cheap online storage for lots of files.
        - **Spark**: a tool that processes big data by splitting the work over many computers.

        You'll learn each of these properly later. For now, just see how they connect.
      `),
      viz('platform', 'Clickable map of a data platform', 'Click each box. Press the buttons to see data flowing.'),
      learn('A normal day for a junior data engineer', `
        - **9:00** Open the scheduler: did last night's data jobs work? Any alerts?
        - **9:30** Short team meeting: what I did yesterday, what I'll do today, anything blocking me.
        - **10:00** New task: *"Add supplier delivery time to the supply-chain tables."* Look at the data in a **notebook**.
        - **12:00** Write the real code in **VS Code**, add a check (test), run it.
        - **14:00** Upload it to GitHub and open a **pull request**; a teammate reviews it.
        - **15:30** After approval, it goes live automatically. Check the new table in the **SQL editor**.
        - **16:30** Write a short description of the new column in the **catalog**, so others understand it.

        Notice: mostly web pages and code, a little terminal, and lots of talking to people.
      `),
      order('Put the journey of one claim through the map in order.', ['Created in Salesforce', 'Copied out by the scheduler\'s nightly job', 'Saved raw in the data lake', 'Cleaned and organised by Spark', 'Described in the catalog', 'Shown on a Power BI dashboard']),
    ]),
    lesson('t5', 'Logins, passwords and connections', 18, [
      learn('Logging in: people vs programs', `
        **People** log in with one company account for everything. This is called **single sign-on (SSO)**: the same login opens Databricks, Azure, GitHub and so on. You never create accounts yourself; IT gives you access.

        **Programs** (your data jobs) also need to log in, but they must **not** use your password. They get their own account, often called a **service account** (Microsoft calls it a *service principal*). It only gets the access it needs.

        **Passwords and keys for programs** are called **secrets**. They are stored in a safe place called a **key vault**. Code asks the vault for the secret when it runs.
        > Never write a password inside code or save it in GitHub. Anyone who sees the code sees the password.
      `),
      learn('What a program needs to connect to a database', `
        Four things, like visiting someone's office:

        | Need | Office version | Data version |
        |---|---|---|
        | **Where** | the building address | the server address and door number («claims-db.company.com:5432») |
        | **Can I reach it?** | the road is open | the company network allows it (VPN, firewall rules) |
        | **Who am I?** | ID badge | the service account's secret from the key vault |
        | **Am I allowed?** | your name is on the list | someone gave the account permission to read that table |

        When a connection fails, the error message tells you **which of the four** went wrong. Next card.
      `),
      match('Match the error to what went wrong.', [
        ['Connection timed out', 'Can\'t reach it: the network blocks the way'],
        ['Unknown host', 'Wrong address'],
        ['Login failed / 401', 'Wrong or expired password or key'],
        ['Permission denied / 403', 'Logged in fine, but not allowed to read this'],
      ], 'Each error points to a different fix: network team, the address, the secret, or the data owner.'),
      scenario('Your new job can\'t read the database', `Your code reads claims from a database. It works on your laptop, but when the job runs on the company servers at night, it fails.`, [
        ['The error says «Connection timed out». What\'s the most likely cause?', [
          ['The company servers can\'t reach the database because of network rules (your laptop can, because you\'re on VPN)', true, 'Timed out = the request never got an answer, so it\'s a network path problem.'],
          ['The password is wrong', false, 'A wrong password gives a "login failed" error, and quickly.'],
          ['The table is empty', false, 'An empty table is not an error.'],
        ]],
        ['The network is fixed. Now: «password authentication failed». What do you check?', [
          ['That the job\'s secret in the key vault is the current one, and the job reads the right secret name', true, 'Passwords get changed; the vault copy may be old.'],
          ['Put your own password in the code', false, 'Never. And jobs should not run as you.'],
        ]],
        ['Now: «permission denied for table claims». What do you do?', [
          ['Ask the table\'s owner to give the job\'s service account read access', true, 'It logged in fine; it just isn\'t allowed yet. Ask for the smallest access it needs.'],
          ['Give the service account full admin rights', false, 'Too much access is a security risk.'],
        ]],
      ]),
      mcq('Where should a data job\'s password live?', ['Inside the code', 'In a key vault, read by the job when it runs', 'In a shared spreadsheet', 'In the README file'], 1),
      tf('With single sign-on, one company login opens Databricks, Azure and GitHub.', true),
    ]),
  ]);
