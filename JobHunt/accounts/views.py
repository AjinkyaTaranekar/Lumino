from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect

from .forms import CustomLoginForm
from .forms import SignUpForm

def home(request):
    return render(request, "home.html")

def login_view(request):
    if request.method == "POST":
        form = CustomLoginForm(request, data=request.POST or None)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            return redirect('home')
    else:
        form = CustomLoginForm()

    return render(request, 'registration/login.html', {'form': form})

def signup(request):
    if request.method == "POST":
        form = SignUpForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)  # auto-login after signup
            return redirect("profile")
    else:
        form = SignUpForm()
    return render(request, "signup.html", {"form": form})

@login_required
def profile(request):
    return render(request, "profile.html")

from .models import RoadmapStep
from django.contrib.auth.decorators import login_required

@login_required
def roadmap(request):
    steps = (
        RoadmapStep.objects
        .filter(user=request.user)
        .order_by("order")
    )

    return render(request, "roadmap.html", {
        "steps": steps
    })

from .models import Job

# def job_list(request):
#     query = request.GET.get("q", "")
#
#     jobs = Job.objects.all()
#
#     if query:
#         jobs = jobs.filter(title__icontains=query)
#
#     return render(request, "jobs.html", {
#         "jobs": jobs,
#         "query": query
#     })

from django.core.paginator import Paginator
def job_list(request):
    # query = request.GET.get("q", "")
    job_list = Job.objects.all().order_by('id')
    paginator = Paginator(job_list, 6)  # 每页 6 个（2x3）

    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    return render(request, 'jobs.html', {
        'page_obj': page_obj
    })